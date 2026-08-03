// ── Outlet Audit — Google Apps Script Backend ────────────────────────────────
// Deploy this as a Web App: Execute as "Me", Access "Anyone"

const SHEET_NAME = "Audits";

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange("A1:H1").setValues([["id","outlet_name","brand","auditor_name","created_at","status","overall_score","parameters"]]);
    sheet.getRange("A1:H1").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function corsResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── GET handler ───────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action || "";
    const id = e.parameter.id || "";

    if (action === "get" && id) {
      return corsResponse(getAudit(id));
    }
    return corsResponse(getAllAudits());
  } catch(err) {
    return corsResponse({ error: err.message });
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === "create") return corsResponse(createAudit(body.data));
    if (action === "update") return corsResponse(updateAudit(body.id, body.data));
    if (action === "delete") return corsResponse(deleteAudit(body.id));

    return corsResponse({ error: "Unknown action: " + action });
  } catch(err) {
    return corsResponse({ error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAllAudits() {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1)
    .filter(r => r[0])
    .map(rowToAudit)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function getAudit(id) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) return rowToAudit(rows[i]);
  }
  throw new Error("Audit not found: " + id);
}

function createAudit(data) {
  const sheet = getSheet();
  const id = Utilities.getUuid();
  const now = new Date().toISOString();
  const params = defaultParameters();
  const row = [id, data.outlet_name, data.brand, data.auditor_name, now, "in-progress", "", JSON.stringify(params)];
  sheet.appendRow(row);
  return rowToAudit(row);
}

function updateAudit(id, data) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      const audit = rowToAudit(rows[i]);
      if (data.outlet_name)  audit.outlet_name  = data.outlet_name;
      if (data.brand)        audit.brand        = data.brand;
      if (data.auditor_name) audit.auditor_name = data.auditor_name;
      if (data.status)       audit.status       = data.status;
      if (data.parameters) {
        audit.parameters   = data.parameters;
        audit.overall_score = calcOverall(data.parameters);
      }
      const rowNum = i + 1;
      sheet.getRange(rowNum, 1, 1, 8).setValues([[
        audit.id, audit.outlet_name, audit.brand, audit.auditor_name,
        audit.created_at, audit.status,
        audit.overall_score != null ? audit.overall_score : "",
        JSON.stringify(audit.parameters)
      ]]);
      return audit;
    }
  }
  throw new Error("Audit not found: " + id);
}

function deleteAudit(id) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { deleted: true };
    }
  }
  throw new Error("Audit not found: " + id);
}

function rowToAudit(row) {
  let params = [];
  try { params = JSON.parse(row[7] || "[]"); } catch(e) {}
  let score = null;
  try { score = row[6] !== "" ? parseFloat(row[6]) : null; } catch(e) {}
  const audit = {
    id: row[0], outlet_name: row[1], brand: row[2], auditor_name: row[3],
    created_at: row[4], status: row[5], overall_score: score, parameters: params
  };
  return enrich(audit);
}

function enrich(audit) {
  audit.parameters.forEach(p => { p.score = calcParamScore(p.checkpoints); });
  audit.overall_score = calcOverall(audit.parameters);
  return audit;
}

function calcParamScore(checkpoints) {
  const passes = checkpoints.filter(c => c.status === "Pass").length;
  const fails  = checkpoints.filter(c => c.status === "Fail").length;
  const total  = passes + fails;
  return total > 0 ? Math.round((passes / total) * 1000) / 10 : null;
}

function calcOverall(parameters) {
  const scores = parameters.map(p => calcParamScore(p.checkpoints)).filter(s => s !== null);
  return scores.length > 0 ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 10) / 10 : null;
}

// ── Default 12 parameters ─────────────────────────────────────────────────────
function defaultParameters() {
  return [
    {name:"Food Quality",checkpoints:[
      {name:"Food temperature meets safe serving standards",status:"N/A",notes:"",photos:[]},
      {name:"Portion sizes consistent with menu specs",status:"N/A",notes:"",photos:[]},
      {name:"Presentation matches brand standard",status:"N/A",notes:"",photos:[]},
      {name:"Ingredients are fresh and within expiry",status:"N/A",notes:"",photos:[]},
      {name:"Taste and seasoning verified by chef",status:"N/A",notes:"",photos:[]},
      {name:"No cross-contamination in food prep",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Kitchen Hygiene",checkpoints:[
      {name:"Hand wash station stocked and accessible",status:"N/A",notes:"",photos:[]},
      {name:"Chopping boards colour-coded correctly",status:"N/A",notes:"",photos:[]},
      {name:"Fridge temperature logged and within range",status:"N/A",notes:"",photos:[]},
      {name:"No cross-contamination risk observed",status:"N/A",notes:"",photos:[]},
      {name:"Floor drains clean and unclogged",status:"N/A",notes:"",photos:[]},
      {name:"All surfaces sanitised before service",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Customer Experience",checkpoints:[
      {name:"Greeting given within 30 seconds of entry",status:"N/A",notes:"",photos:[]},
      {name:"Menu knowledge demonstrated by staff",status:"N/A",notes:"",photos:[]},
      {name:"Order accuracy confirmed before delivery",status:"N/A",notes:"",photos:[]},
      {name:"Wait time communicated proactively",status:"N/A",notes:"",photos:[]},
      {name:"Customer complaints handled promptly",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Staff Performance & Grooming",checkpoints:[
      {name:"All staff in full uniform with name badges",status:"N/A",notes:"",photos:[]},
      {name:"Hair covered in food prep areas",status:"N/A",notes:"",photos:[]},
      {name:"No jewellery worn by kitchen staff",status:"N/A",notes:"",photos:[]},
      {name:"Staff briefed on specials and 86 list",status:"N/A",notes:"",photos:[]},
      {name:"Punctuality — all stations staffed on time",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Maintenance & Equipment",checkpoints:[
      {name:"All kitchen equipment functioning correctly",status:"N/A",notes:"",photos:[]},
      {name:"No visible damage to equipment",status:"N/A",notes:"",photos:[]},
      {name:"POS system operational",status:"N/A",notes:"",photos:[]},
      {name:"HVAC and ventilation working",status:"N/A",notes:"",photos:[]},
      {name:"Fire suppression system inspected tag current",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Cleanliness (Front of House)",checkpoints:[
      {name:"Tables cleaned between every cover",status:"N/A",notes:"",photos:[]},
      {name:"Floors swept and mopped",status:"N/A",notes:"",photos:[]},
      {name:"Menus clean and free of damage",status:"N/A",notes:"",photos:[]},
      {name:"Restrooms clean and stocked",status:"N/A",notes:"",photos:[]},
      {name:"Windows and glass surfaces spotless",status:"N/A",notes:"",photos:[]},
      {name:"Entrance area clear and presentable",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Cleanliness (Back of House)",checkpoints:[
      {name:"Prep surfaces clean between uses",status:"N/A",notes:"",photos:[]},
      {name:"Waste bins emptied regularly",status:"N/A",notes:"",photos:[]},
      {name:"Grease traps checked and clean",status:"N/A",notes:"",photos:[]},
      {name:"Storage areas organised and labelled",status:"N/A",notes:"",photos:[]},
      {name:"Pest control bait stations in place",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Opening Readiness",checkpoints:[
      {name:"Mis en place complete before opening",status:"N/A",notes:"",photos:[]},
      {name:"All stations fully stocked",status:"N/A",notes:"",photos:[]},
      {name:"Specials and 86 list communicated",status:"N/A",notes:"",photos:[]},
      {name:"Reservation sheet reviewed by floor lead",status:"N/A",notes:"",photos:[]},
      {name:"Opening checklist signed off",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Closing Compliance",checkpoints:[
      {name:"All food stored at correct temperatures",status:"N/A",notes:"",photos:[]},
      {name:"Cash reconciled and secured",status:"N/A",notes:"",photos:[]},
      {name:"Equipment switched off per SOPs",status:"N/A",notes:"",photos:[]},
      {name:"Closing checklist signed off",status:"N/A",notes:"",photos:[]},
      {name:"Security walk-through completed",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Service Standards",checkpoints:[
      {name:"Table turns within brand time targets",status:"N/A",notes:"",photos:[]},
      {name:"Upselling attempted on beverages/desserts",status:"N/A",notes:"",photos:[]},
      {name:"Correct service sequence followed",status:"N/A",notes:"",photos:[]},
      {name:"Bill presented promptly when requested",status:"N/A",notes:"",photos:[]},
      {name:"Guest farewell given at exit",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Safety & Storage",checkpoints:[
      {name:"Fire exits clear and unobstructed",status:"N/A",notes:"",photos:[]},
      {name:"First aid kit stocked and accessible",status:"N/A",notes:"",photos:[]},
      {name:"FIFO labelling on all stored items",status:"N/A",notes:"",photos:[]},
      {name:"Allergen information available to staff",status:"N/A",notes:"",photos:[]},
      {name:"Chemicals stored separately from food",status:"N/A",notes:"",photos:[]},
      {name:"Sharp objects stored safely",status:"N/A",notes:"",photos:[]}
    ],score:null},
    {name:"Overall Execution",checkpoints:[
      {name:"Outlet operating smoothly under observation",status:"N/A",notes:"",photos:[]},
      {name:"Manager visible and engaged on floor",status:"N/A",notes:"",photos:[]},
      {name:"SOPs available and accessible to staff",status:"N/A",notes:"",photos:[]},
      {name:"Daily specials board updated",status:"N/A",notes:"",photos:[]},
      {name:"Brand standards visibly upheld",status:"N/A",notes:"",photos:[]}
    ],score:null}
  ];
}
