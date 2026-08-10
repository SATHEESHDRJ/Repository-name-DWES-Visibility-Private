const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
// Use project's parse via dynamic import of compiled? Prefer direct require of ts via tsx if available.
// Instead: simulate auto-mapping + far-end derivation like parse-wiring.
const XLSX = require("xlsx");
const file = "C:\\Users\\sathe\\OneDrive\\Desktop\\wring_frame\\ENOWA Mobile Substation\\=H00+R.xlsx";
const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["WIRING SCHEDULE"], { header: 1, defval: "" });
const headers = rows[0].map(h => String(h||"").trim());
function farEnd(pair, thisEnd) {
  if (!String(pair).includes("/")) return null;
  const parts = String(pair).split("/", 2).map(t => t.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.find(p => p !== thisEnd) ?? parts[1];
}
console.log("Mapping check against DWES auto keys:");
const autoHints = {
  sno: ["s.no","sno"],
  source_device: ["dev_tblk_a","dev_a"],
  source_terminal: ["term_a"],
  dest_device: ["dev_tblk_b","dev_b"],
  dest_terminal: ["term_b"],
  ferrule: ["iec_ferr_a","ferrule"],
  color: ["wire color","color"],
  size: ["wire size","size"],
  length: ["length"],
  panel: ["pnlno"],
  sign: ["sign mark","sign"],
  remarks: ["remark"],
  ref: ["refrnce","ref"],
};
for (const [k, patterns] of Object.entries(autoHints)) {
  const hit = headers.find(h => patterns.some(p => h.toLowerCase().includes(p) || h.toLowerCase() === p));
  console.log(k, "->", hit || "(none)");
}
console.log("\nDerived SRC/DST from first 8 rows (device:term / far ferrule):");
for (let i = 1; i <= 8; i++) {
  const r = rows[i];
  const obj = {}; headers.forEach((h,idx)=>obj[h]=r[idx]);
  const srcDev = String(obj["DEV_TBLK_A"]||"").trim();
  const srcTerm = String(obj["TERM_A"]||"").trim();
  const thisEnd = srcDev && srcTerm ? `${srcDev}:${srcTerm}` : "";
  const ferrA = String(obj["IEC_FERR_A"]||"").trim();
  const ferrB = String(obj["IEC_FERR_B"]||"").trim();
  const dst = farEnd(ferrA, thisEnd) || farEnd(ferrB, thisEnd);
  console.log(`S.${obj["S.NO"]} SRC=${thisEnd} DST=${dst} FERR_A=${ferrA} COLOR=${String(obj["WIRE COLOR"]||"").trim()}`);
}
