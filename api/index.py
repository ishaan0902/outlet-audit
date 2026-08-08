from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from mangum import Mangum
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

# ── MySQL setup ───────────────────────────────────────────────────────────────
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

DB_HOST     = os.getenv("DB_HOST", "34.100.230.30")
DB_PORT     = os.getenv("DB_PORT", "3306")
DB_USER     = os.getenv("DB_USER", "Dohful")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Doh$%^Isa6")
DB_NAME     = os.getenv("DB_NAME", "DOHFUL_ANALYTICS")

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# NullPool is safer for serverless (Vercel) — no persistent connections
engine = create_engine(DATABASE_URL, poolclass=NullPool)

def get_conn():
    return engine.connect()

def ensure_table():
    with get_conn() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS outlet_audits (
                id            VARCHAR(36)  PRIMARY KEY,
                outlet_name   VARCHAR(255) NOT NULL,
                brand         VARCHAR(255) NOT NULL,
                auditor_name  VARCHAR(255) NOT NULL,
                created_at    DATETIME     NOT NULL,
                status        VARCHAR(50)  NOT NULL DEFAULT 'in-progress',
                overall_score FLOAT,
                parameters    LONGTEXT
            )
        """))
        conn.commit()

# Create table on startup (safe — IF NOT EXISTS)
try:
    ensure_table()
except Exception as e:
    print(f"Warning: could not ensure table: {e}")

# ── Parameters ────────────────────────────────────────────────────────────────
PARAMETERS = [
    {"name": "Food Quality", "checkpoints": ["Food temperature meets safe serving standards","Portion sizes consistent with menu specs","Presentation matches brand standard","Ingredients are fresh and within expiry","Taste and seasoning verified by chef","No cross-contamination in food prep"]},
    {"name": "Kitchen Hygiene", "checkpoints": ["Hand wash station stocked and accessible","Chopping boards colour-coded correctly","Fridge temperature logged and within range","No cross-contamination risk observed","Floor drains clean and unclogged","All surfaces sanitised before service"]},
    {"name": "Customer Experience", "checkpoints": ["Greeting given within 30 seconds of entry","Menu knowledge demonstrated by staff","Order accuracy confirmed before delivery","Wait time communicated proactively","Customer complaints handled promptly"]},
    {"name": "Staff Performance & Grooming", "checkpoints": ["All staff in full uniform with name badges","Hair covered in food prep areas","No jewellery worn by kitchen staff","Staff briefed on specials and 86 list","Punctuality — all stations staffed on time"]},
    {"name": "Maintenance & Equipment", "checkpoints": ["All kitchen equipment functioning correctly","No visible damage to equipment","POS system operational","HVAC and ventilation working","Fire suppression system inspected tag current"]},
    {"name": "Cleanliness (Front of House)", "checkpoints": ["Tables cleaned between every cover","Floors swept and mopped","Menus clean and free of damage","Restrooms clean and stocked","Windows and glass surfaces spotless","Entrance area clear and presentable"]},
    {"name": "Cleanliness (Back of House)", "checkpoints": ["Prep surfaces clean between uses","Waste bins emptied regularly","Grease traps checked and clean","Storage areas organised and labelled","Pest control bait stations in place"]},
    {"name": "Opening Readiness", "checkpoints": ["Mis en place complete before opening","All stations fully stocked","Specials and 86 list communicated","Reservation sheet reviewed by floor lead","Opening checklist signed off"]},
    {"name": "Closing Compliance", "checkpoints": ["All food stored at correct temperatures","Cash reconciled and secured","Equipment switched off per SOPs","Closing checklist signed off","Security walk-through completed"]},
    {"name": "Service Standards", "checkpoints": ["Table turns within brand time targets","Upselling attempted on beverages/desserts","Correct service sequence followed","Bill presented promptly when requested","Guest farewell given at exit"]},
    {"name": "Safety & Storage", "checkpoints": ["Fire exits clear and unobstructed","First aid kit stocked and accessible","FIFO labelling on all stored items","Allergen information available to staff","Chemicals stored separately from food","Sharp objects stored safely"]},
    {"name": "Overall Execution", "checkpoints": ["Outlet operating smoothly under observation","Manager visible and engaged on floor","SOPs available and accessible to staff","Daily specials board updated","Brand standards visibly upheld"]},
]

def default_parameters():
    return [{"name": p["name"], "checkpoints": [{"name": cp, "status": "N/A", "notes": "", "photos": []} for cp in p["checkpoints"]], "score": None} for p in PARAMETERS]

def calc_param_score(checkpoints):
    p = sum(1 for c in checkpoints if c["status"] == "Pass")
    f = sum(1 for c in checkpoints if c["status"] == "Fail")
    return round((p / (p + f)) * 100, 1) if (p + f) > 0 else None

def calc_overall(parameters):
    scores = [calc_param_score(p["checkpoints"]) for p in parameters]
    valid = [s for s in scores if s is not None]
    return round(sum(valid) / len(valid), 1) if valid else None

def enrich(audit):
    for p in audit.get("parameters", []):
        p["score"] = calc_param_score(p["checkpoints"])
    audit["overall_score"] = calc_overall(audit.get("parameters", []))
    return audit

def row_to_dict(row):
    d = dict(row._mapping)
    try:
        d["parameters"] = json.loads(d["parameters"]) if d["parameters"] else []
    except:
        d["parameters"] = []
    if isinstance(d.get("created_at"), datetime):
        d["created_at"] = d["created_at"].isoformat()
    return d

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
    outlet_name:  Optional[str] = None
    brand:        Optional[str] = None
    auditor_name: Optional[str] = None
    status:       Optional[str] = None
    parameters:   Optional[List[ParameterModel]] = None

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "storage": "mysql"}

@app.get("/api/audits")
async def get_audits():
    with get_conn() as conn:
        rows = conn.execute(text("SELECT * FROM outlet_audits ORDER BY created_at DESC")).fetchall()
    return [enrich(row_to_dict(r)) for r in rows]

@app.post("/api/audits", status_code=201)
async def create_audit(data: AuditCreate):
    audit = {
        "id": str(uuid.uuid4()),
        "outlet_name": data.outlet_name,
        "brand": data.brand,
        "auditor_name": data.auditor_name,
        "created_at": datetime.utcnow().isoformat(),
        "status": "in-progress",
        "overall_score": None,
        "parameters": default_parameters(),
    }
    with get_conn() as conn:
        conn.execute(text("""
            INSERT INTO outlet_audits
                (id, outlet_name, brand, auditor_name, created_at, status, overall_score, parameters)
            VALUES
                (:id, :outlet_name, :brand, :auditor_name, :created_at, :status, :overall_score, :parameters)
        """), {
            **audit,
            "parameters": json.dumps(audit["parameters"], ensure_ascii=False),
        })
        conn.commit()
    return enrich(audit)

@app.get("/api/audits/{audit_id}")
async def get_audit(audit_id: str):
    with get_conn() as conn:
        row = conn.execute(
            text("SELECT * FROM outlet_audits WHERE id = :id"), {"id": audit_id}
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    return enrich(row_to_dict(row))

@app.put("/api/audits/{audit_id}")
async def update_audit(audit_id: str, data: AuditUpdate):
    with get_conn() as conn:
        row = conn.execute(
            text("SELECT * FROM outlet_audits WHERE id = :id"), {"id": audit_id}
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = row_to_dict(row)
        update_data = data.model_dump(exclude_none=True)

        if "parameters" in update_data:
            params = update_data["parameters"]
            for p in params:
                p["score"] = calc_param_score(p["checkpoints"])
            audit["parameters"] = params
            audit["overall_score"] = calc_overall(params)

        for field in ["outlet_name", "brand", "auditor_name", "status"]:
            if field in update_data:
                audit[field] = update_data[field]

        conn.execute(text("""
            UPDATE outlet_audits
            SET outlet_name   = :outlet_name,
                brand         = :brand,
                auditor_name  = :auditor_name,
                status        = :status,
                overall_score = :overall_score,
                parameters    = :parameters
            WHERE id = :id
        """), {
            "id": audit_id,
            "outlet_name": audit["outlet_name"],
            "brand": audit["brand"],
            "auditor_name": audit["auditor_name"],
            "status": audit["status"],
            "overall_score": audit.get("overall_score"),
            "parameters": json.dumps(audit["parameters"], ensure_ascii=False),
        })
        conn.commit()

    return enrich(audit)

@app.delete("/api/audits/{audit_id}", status_code=204)
async def delete_audit(audit_id: str):
    with get_conn() as conn:
        result = conn.execute(
            text("DELETE FROM outlet_audits WHERE id = :id"), {"id": audit_id}
        )
        conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Audit not found")
    return None

# Vercel serverless handler
handler = Mangum(app)
