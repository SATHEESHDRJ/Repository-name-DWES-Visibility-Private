const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const files = [
  "C:\\Users\\sathe\\OneDrive\\Desktop\\wring_frame\\ENOWA Mobile Substation\\=H00+R.xlsx",
  "C:\\Users\\sathe\\OneDrive\\Desktop\\wring_frame\\ENOWA Mobile Substation\\=T601+R1.xlsx",
  "C:\\Users\\sathe\\OneDrive\\Desktop\\wring_frame\\ENOWA Mobile Substation\\=T601+R2.xlsx",
];
function scoreSheet(rows) {
  const flat = rows.slice(0, 15).map(r => (r||[]).map(c => String(c||"").toLowerCase()).join("|")).join("||");
  let s = 0;
  if (/s\.?no|sno|sl\.?no/.test(flat)) s += 5;
  if (/source|from|src_dev|dev_tblk_a|dev_a/.test(flat)) s += 3;
  if (/dest|to|dst_dev|dev_tblk_b|dev_b/.test(flat)) s += 3;
  if (/ferrule|term_a|term_b|wire/.test(flat)) s += 2;
  return s;
}
for (const file of files) {
  console.log("\n====", path.basename(file));
  const wb = XLSX.readFile(file);
  console.log("Sheets:", wb.SheetNames.join(" | "));
  let best = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
    const sc = scoreSheet(rows);
    console.log("  sheet", JSON.stringify(name), "rows", rows.length, "score", sc);
    if (!best || sc > best.sc) best = { name, rows, sc };
  }
  if (!best || best.sc < 3) { console.log("  NO wiring-like sheet"); continue; }
  // find header row
  let headerIdx = 0;
  for (let i = 0; i < Math.min(20, best.rows.length); i++) {
    const line = (best.rows[i]||[]).map(c => String(c||"").toLowerCase()).join("|");
    if (/s\.?no|sno|ferrule|source|dev_a|term_a/.test(line)) { headerIdx = i; break; }
  }
  const headers = (best.rows[headerIdx]||[]).map(h => String(h??"").trim());
  console.log("  BEST:", best.name, "headerRow", headerIdx, "score", best.sc);
  console.log("  Headers:", JSON.stringify(headers));
  for (let i = headerIdx+1; i <= headerIdx+3 && i < best.rows.length; i++) {
    const row = best.rows[i]||[];
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx]; });
    console.log("  Data", i-headerIdx, JSON.stringify(obj));
  }
}
