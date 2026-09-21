const fs = require("fs");
const path = require("path");
let XLSX;
try { XLSX = require("xlsx"); } catch { try { XLSX = require("./backend/node_modules/xlsx"); } catch(e) { console.error("no xlsx", e.message); process.exit(1); } }
const ROOT = "C:\\Users\\sathe\\OneDrive\\Desktop\\wring_frame";
const WANT = ["H00+R", "T601+R1", "T601+R2", "E01+M1", "E01+R1", "CP.xlsx"];
function walk(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.xlsx$/i.test(ent.name) && !ent.name.startsWith("~$")) out.push(p);
  }
  return out;
}
const all = walk(ROOT);
console.log("Found", all.length, "xlsx under", ROOT);
const picks = all.filter(p => WANT.some(w => p.includes(w) || path.basename(p) === w));
const targets = picks.length ? picks.slice(0, 8) : all.filter(p => /ENOWA|enowa/i.test(p)).slice(0, 8);
if (!targets.length) { all.slice(0, 25).forEach(p => console.log(" ", p)); process.exit(0); }
for (const file of targets) {
  console.log("\n====", file);
  try {
    const wb = XLSX.readFile(file, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
    const headers = (rows[0] || []).map(h => String(h ?? "").trim());
    console.log("Sheet:", sheetName);
    console.log("Headers:", JSON.stringify(headers));
    for (let i = 1; i <= Math.min(3, rows.length - 1); i++) {
      const row = rows[i] || [];
      const obj = {};
      headers.forEach((h, idx) => { if (h) obj[h] = row[idx]; });
      console.log("Row", i, JSON.stringify(obj));
    }
  } catch (e) { console.log("READ_FAIL:", e.message); }
}
