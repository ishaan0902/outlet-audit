from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import os, json, uuid
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Outlet Audit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Google Sheets setup ──────────────────────────────────────────────────────
import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "")
GOOGLE_CREDS_JSON = os.getenv("GOOGLE_CREDS_JSON", "")  # full service account JSON as string

_sheet_client = None
_worksheet = None

def get_worksheet():
    global _sheet_client, _worksheet
    if _worksheet is not None:
        return _worksheet
    if not SPREADSHEET_ID or not GOOGLE_CREDS_JSON:
        raise RuntimeError("SPREADSHEET_ID and GOOGLE_CREDS_JSON env vars are required")
    creds_dict = json.loads(GOOGLE_CREDS_JSON)
    creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    _sheet_client = gspread.authorize(creds)
    spreadsheet = _sheet_client.open_by_key(SPREADSHEET_ID)
    # Use first sheet, create headers if empty
    ws = spreadsheet.sheet1
    if ws.row_count == 0 or ws.cell(1, 1).value != "id":
        ws.update("A1:I1", [["id", "outlet_name", "brand", "auditor_name", "created_at", "status", "overall_score", "parameters"]])
        ws.format("A1:H1", {"textFormat": {"bold": True}})
    _worksheet = ws
    return _worksheet


def _ensure_headers(ws):
    """Make sure header row exists."""
    try:
        val = ws.cell(1, 1).value
    except Exception:
        val = None
    if val != "id":
        ws.update("A1:H1", [["id", "outlet_name", "brand", "auditor_name", "created_at", "status", "overall_score", "parameters"]])
        ws.format("A1:H1", {"textFormat": {"bold": True}})


# ── Sheet helpers ─────────────────────────────────────────────────────────────
COLS = ["id", "outlet_name", "brand", "auditor_name", "created_at", "status", "overall_score", "parameters"]

def row_to_dict(row: list) -> dict:
    """Convert a sheet row (list) to an audit dict."""
    d = {}
    for i, col in enumerate(COLS):
        d[col] = row[i] if i < len(row) else ""
    # Parse parameters JSON
    try:
        d["parameters"] = json.loads(d["parameters"]) if d["parameters"] else []
    except Exception:
        d["parameters"] = []
    # Parse overall_score
    try:
        d["overall_score"] = float(d["overall_score"]) if d["overall_score"] not in ("", None) else None
    except Exception:
        d["overall_score"] = None
    return d


def dict_to_row(audit: dict) -> list:
    """Convert audit dict to a flat sheet row."""
    return [
        audit.get("id", ""),
        audit.get("outlet_name", ""),
        audit.get("brand", ""),
        audit.get("auditor_name", ""),
        audit.get("created_at", ""),
        audit.get("status", "in-progress"),
        str(audit.get("overall_score", "")) if audit.get("overall_score") is not None else "",
        json.dumps(audit.get("parameters", []), ensure_ascii=False),
    ]


def find_row_index(ws, audit_id: str) -> int:
    """Return 1-based row index of audit_id, or -1 if not found."""
    ids = ws.col_values(1)  # all values in column A
    for i, v in enumerate(ids):
        if v == audit_id:
            return i + 1  # 1-based
    return -1


# ── Audit parameters ──────────────────────────────────────────────────────────
PARAMETERS = [
    {"name": "Food Quality", "checkpoints": [
        "Food temperature meets safe serving standards",
        "Portion sizes consistent with menu specs",
        "Presentation matches brand standard",
        "Ingredients are fresh and within expiry",
        "Taste and seasoning verified by chef",
        "No cross-contamination in food prep",
    ]},
    {"name": "Kitchen Hygiene", "checkpoints": [
        "Hand wash station stocked and accessible",
        "Chopping boards colour-coded correctly",
        "Fridge temperature logged and within range",
        "No cross-contamination risk observed",
        "Floor drains clean and unclogged",
        "All surfaces sanitised before service",
    ]},
    {"name": "Customer Experience", "checkpoints": [
        "Greeting given within 30 seconds of entry",
        "Menu knowledge demonstrated by staff",
        "Order accuracy confirmed before delivery",
        "Wait time communicated proactively",
        "Customer complaints handled promptly",
    ]},
    {"name": "Staff Performance & Grooming", "checkpoints": [
        "All staff in full uniform with name badges",
        "Hair covered in food prep areas",
        "No jewellery worn by kitchen staff",
        "Staff briefed on specials and 86 list",
        "Punctuality — all stations staffed on time",
    ]},
    {"name": "Maintenance & Equipment", "checkpoints": [
        "All kitchen equipment functioning correctly",
        "No visible damage to equipment",
        "POS system operational",
        "HVAC and ventilation working",
        "Fire suppression system inspected tag current",
    ]},
    {"name": "Cleanliness (Front of House)", "checkpoints": [
        "Tables cleaned between every cover",
        "Floors swept and mopped",
        "Menus clean and free of damage",
        "Restrooms clean and stocked",
        "Windows and glass surfaces spotless",
        "Entrance area clear and presentable",
    ]},
    {"name": "Cleanliness (Back of House)", "checkpoints": [
        "Prep surfaces clean between uses",
        "Waste bins emptied regularly",
        "Grease traps checked and clean",
        "Storage areas organised and labelled",
        "Pest control bait stations in place",
    ]},
    {"name": "Opening Readiness", "checkpoints": [
        "Mis en place complete before opening",
        "All stations fully stocked",
        "Specials and 86 list communicated",
        "Reservation sheet reviewed by floor lead",
        "Opening checklist signed off",
    ]},
    {"name": "Closing Compliance", "checkpoints": [
        "All food stored at correct temperatures",
        "Cash reconciled and secured",
        "Equipment switched off per SOPs",
        "Closing checklist signed off",
        "Security walk-through completed",
    ]},
    {"name": "Service Standards", "checkpoints": [
        "Table turns within brand time targets",
        "Upselling attempted on beverages/desserts",
        "Correct service sequence followed",
        "Bill presented promptly when requested",
        "Guest farewell given at exit",
    ]},
    {"name": "Safety & Storage", "checkpoints": [
        "Fire exits clear and unobstructed",
        "First aid kit stocked and accessible",
        "FIFO labelling on all stored items",
        "Allergen information available to staff",
        "Chemicals stored separately from food",
        "Sharp objects stored safely",
    ]},
    {"name": "Overall Execution", "checkpoints": [
        "Outlet operating smoothly under observation",
        "Manager visible and engaged on floor",
        "SOPs available and accessible to staff",
        "Daily specials board updated",
        "Brand standards visibly upheld",
    ]},
]


def default_parameters():
    return [
        {
            "name": p["name"],
            "checkpoints": [
                {"name": cp, "status": "N/A", "notes": "", "photos": []}
                for cp in p["checkpoints"]
            ],
            "score": None,
        }
        for p in PARAMETERS
    ]


def calc_param_score(checkpoints):
    passes = sum(1 for c in checkpoints if c["status"] == "Pass")
    fails  = sum(1 for c in checkpoints if c["status"] == "Fail")
    total  = passes + fails
    if total == 0:
        return None
    return round((passes / total) * 100, 1)


def calc_overall(parameters):
    scores = [calc_param_score(p["checkpoints"]) for p in parameters]
    valid  = [s for s in scores if s is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 1)


def enrich(audit: dict) -> dict:
    for p in audit.get("parameters", []):
        p["score"] = calc_param_score(p["checkpoints"])
    audit["overall_score"] = calc_overall(audit.get("parameters", []))
    return audit


# ── Pydantic models ───────────────────────────────────────────────────────────
class CheckpointModel(BaseModel):
    name: str
    status: str = "N/A"
    notes: str = ""
    photos: List[str] = []


class ParameterModel(BaseModel):
    name: str
    checkpoints: List[CheckpointModel]
    score: Optional[float] = None


class AuditCreate(BaseModel):
    outlet_name: str
    brand: str
    auditor_name: str


class AuditUpdate(BaseModel):
    outlet_name:   Optional[str] = None
    brand:         Optional[str] = None
    auditor_name:  Optional[str] = None
    status:        Optional[str] = None
    parameters:    Optional[List[ParameterModel]] = None


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "storage": "google_sheets"}


@app.get("/api/audits")
async def get_audits():
    ws = get_worksheet()
    _ensure_headers(ws)
    all_rows = ws.get_all_values()
    if len(all_rows) <= 1:
        return []
    # Skip header row, skip empty rows
    audits = []
    for row in all_rows[1:]:
        if not row or not row[0]:
            continue
        audit = row_to_dict(row)
        enrich(audit)
        audits.append(audit)
    # Sort newest first by created_at
    audits.sort(key=lambda a: a.get("created_at", ""), reverse=True)
    return audits


@app.post("/api/audits", status_code=201)
async def create_audit(data: AuditCreate):
    ws = get_worksheet()
    _ensure_headers(ws)
    now = datetime.utcnow().isoformat()
    audit = {
        "id":           str(uuid.uuid4()),
        "outlet_name":  data.outlet_name,
        "brand":        data.brand,
        "auditor_name": data.auditor_name,
        "created_at":   now,
        "status":       "in-progress",
        "overall_score": None,
        "parameters":   default_parameters(),
    }
    ws.append_row(dict_to_row(audit), value_input_option="RAW")
    return enrich(audit)


@app.get("/api/audits/{audit_id}")
async def get_audit(audit_id: str):
    ws = get_worksheet()
    idx = find_row_index(ws, audit_id)
    if idx == -1:
        raise HTTPException(status_code=404, detail="Audit not found")
    row = ws.row_values(idx)
    return enrich(row_to_dict(row))


@app.put("/api/audits/{audit_id}")
async def update_audit(audit_id: str, data: AuditUpdate):
    ws = get_worksheet()
    idx = find_row_index(ws, audit_id)
    if idx == -1:
        raise HTTPException(status_code=404, detail="Audit not found")

    # Read existing
    row  = ws.row_values(idx)
    audit = row_to_dict(row)

    # Apply updates
    update_data = data.model_dump(exclude_none=True)
    if "parameters" in update_data:
        # model_dump gives dicts already
        params = update_data["parameters"]
        for p in params:
            p["score"] = calc_param_score(p["checkpoints"])
        update_data["overall_score"] = calc_overall(params)
        audit["parameters"] = params
        audit["overall_score"] = update_data["overall_score"]

    for field in ["outlet_name", "brand", "auditor_name", "status"]:
        if field in update_data:
            audit[field] = update_data[field]

    # Write back full row
    new_row = dict_to_row(audit)
    ws.update(f"A{idx}:H{idx}", [new_row])
    return enrich(audit)


@app.delete("/api/audits/{audit_id}", status_code=204)
async def delete_audit(audit_id: str):
    ws = get_worksheet()
    idx = find_row_index(ws, audit_id)
    if idx == -1:
        raise HTTPException(status_code=404, detail="Audit not found")
    ws.delete_rows(idx)
    return None
