from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import os, json, uuid
from pathlib import Path
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

# ── Storage backend ─────────────────────────────────────────────────────────
MONGO_URL = os.getenv("MONGO_URL", "")
USE_MONGO = bool(MONGO_URL)

if USE_MONGO:
    from motor.motor_asyncio import AsyncIOMotorClient
    from bson import ObjectId
    _client = AsyncIOMotorClient(MONGO_URL)
    _db = _client[os.getenv("DB_NAME", "outlet_audit")]
    _col = _db["audits"]
else:
    # JSON file store (no external deps required for local dev)
    DATA_FILE = Path(__file__).parent / "data.json"

    def _load_db():
        if DATA_FILE.exists():
            return json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return []

    def _save_db(records):
        DATA_FILE.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Audit parameters ─────────────────────────────────────────────────────────
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
        {"name": p["name"], "checkpoints": [
            {"name": cp, "status": "N/A", "notes": "", "photos": []}
            for cp in p["checkpoints"]
        ], "score": None}
        for p in PARAMETERS
    ]


def calc_param_score(checkpoints):
    passes = sum(1 for c in checkpoints if c["status"] == "Pass")
    fails = sum(1 for c in checkpoints if c["status"] == "Fail")
    total = passes + fails
    if total == 0:
        return None
    return round((passes / total) * 100, 1)


def calc_overall(parameters):
    scores = [calc_param_score(p["checkpoints"]) for p in parameters]
    valid = [s for s in scores if s is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 1)


def enrich(audit: dict) -> dict:
    for p in audit.get("parameters", []):
        p["score"] = calc_param_score(p["checkpoints"])
    audit["overall_score"] = calc_overall(audit.get("parameters", []))
    return audit


# ── Pydantic models ──────────────────────────────────────────────────────────
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
    outlet_name: Optional[str] = None
    brand: Optional[str] = None
    auditor_name: Optional[str] = None
    status: Optional[str] = None
    parameters: Optional[List[ParameterModel]] = None


# ── JSON-file helpers ────────────────────────────────────────────────────────
def _json_get_all():
    return _load_db()

def _json_get(audit_id: str):
    records = _load_db()
    for r in records:
        if r["id"] == audit_id:
            return r
    return None

def _json_insert(doc: dict):
    records = _load_db()
    records.insert(0, doc)
    _save_db(records)

def _json_update(audit_id: str, update_data: dict):
    records = _load_db()
    found = False
    for r in records:
        if r["id"] == audit_id:
            r.update(update_data)
            found = True
            break
    if found:
        _save_db(records)
    return found

def _json_delete(audit_id: str):
    records = _load_db()
    new_records = [r for r in records if r["id"] != audit_id]
    if len(new_records) == len(records):
        return False
    _save_db(new_records)
    return True


# ── Routes ───────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "storage": "mongodb" if USE_MONGO else "json"}


@app.get("/api/audits")
async def get_audits():
    if USE_MONGO:
        audits = []
        async for doc in _col.find({}).sort("created_at", -1):
            doc["id"] = str(doc.pop("_id"))
            audits.append(enrich(doc))
        return audits
    else:
        return [enrich(dict(a)) for a in sorted(_json_get_all(), key=lambda x: x.get("created_at", ""), reverse=True)]


@app.post("/api/audits", status_code=201)
async def create_audit(data: AuditCreate):
    now = datetime.utcnow().isoformat()
    if USE_MONGO:
        doc = {
            "outlet_name": data.outlet_name, "brand": data.brand,
            "auditor_name": data.auditor_name, "created_at": now,
            "status": "in-progress", "overall_score": None,
            "parameters": default_parameters(),
        }
        result = await _col.insert_one(doc)
        doc["id"] = str(result.inserted_id)
        del doc["_id"]
        return enrich(doc)
    else:
        doc = {
            "id": str(uuid.uuid4()),
            "outlet_name": data.outlet_name, "brand": data.brand,
            "auditor_name": data.auditor_name, "created_at": now,
            "status": "in-progress", "overall_score": None,
            "parameters": default_parameters(),
        }
        _json_insert(doc)
        return enrich(dict(doc))


@app.get("/api/audits/{audit_id}")
async def get_audit(audit_id: str):
    if USE_MONGO:
        try:
            oid = ObjectId(audit_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid audit ID")
        doc = await _col.find_one({"_id": oid})
        if not doc:
            raise HTTPException(status_code=404, detail="Audit not found")
        doc["id"] = str(doc.pop("_id"))
        return enrich(doc)
    else:
        doc = _json_get(audit_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Audit not found")
        return enrich(dict(doc))


@app.put("/api/audits/{audit_id}")
async def update_audit(audit_id: str, data: AuditUpdate):
    update_data = data.model_dump(exclude_none=True)
    if "parameters" in update_data:
        params = update_data["parameters"]
        for p in params:
            p["score"] = calc_param_score(p["checkpoints"])
        update_data["overall_score"] = calc_overall(params)

    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    if USE_MONGO:
        try:
            oid = ObjectId(audit_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid audit ID")
        result = await _col.update_one({"_id": oid}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Audit not found")
        doc = await _col.find_one({"_id": oid})
        doc["id"] = str(doc.pop("_id"))
        return enrich(doc)
    else:
        if not _json_update(audit_id, update_data):
            raise HTTPException(status_code=404, detail="Audit not found")
        doc = _json_get(audit_id)
        return enrich(dict(doc))


@app.delete("/api/audits/{audit_id}", status_code=204)
async def delete_audit(audit_id: str):
    if USE_MONGO:
        try:
            oid = ObjectId(audit_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid audit ID")
        result = await _col.delete_one({"_id": oid})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Audit not found")
    else:
        if not _json_delete(audit_id):
            raise HTTPException(status_code=404, detail="Audit not found")
    return None
