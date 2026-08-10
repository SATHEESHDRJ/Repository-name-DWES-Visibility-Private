const XLSX = require("xlsx");
const file = "C:\\Users\\sathe\\OneDrive\\Desktop\\wring_frame\\ENOWA Mobile Substation\\=H00+R.xlsx";
const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["WIRING SCHEDULE"], { header: 1, defval: "" });
let headerIdx = 0;
for (let i = 0; i < Math.min(25, rows.length); i++) {
  const line = (rows[i]||[]).map(c => String(c||"").toLowerCase()).join("|");
  if (/s\.?no|dev_tblk|term_a|ferrule/.test(line)) { headerIdx = i; break; }
}
const headers = (rows[headerIdx]||[]).map(h => String(h??"").trim());
console.log("headerIdx", headerIdx);
console.log("Headers:", JSON.stringify(headers));
for (let i = headerIdx+1; i <= headerIdx+5; i++) {
  const row = rows[i]||[];
  const obj = {};
  headers.forEach((h, idx) => { if (h) obj[h] = row[idx]; });
  console.log("R"+i, JSON.stringify(obj));
}
