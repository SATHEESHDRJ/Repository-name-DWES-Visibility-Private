const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Simulate DWES auto-mapping + parse-wiring far-end for ENOWA H00 WIRING SCHEDULE
function farEndOfPair(pair, thisEnd) {
  if (!String(pair||"").includes("/")) return null;
  const parts = String(pair).split("/", 2).map(t => t.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.find(p => p !== thisEnd) ?? parts[1];
}
function buildAuto(headers) {
  const auto = {};
  const rules = [
    ["sno", h => { const hl=h.toLowerCase(); return hl==="s.no"||hl==="s.no."||hl==="sno"; }],
    ["ferrule", h => { const hl=h.toLowerCase(); return hl==="iec_ferr_a"||(hl.includes("ferr")&&!hl.endsWith("_b")); }],
    ["source_device", h => { const hl=h.toLowerCase(); return hl==="dev_tblk_a"||hl==="dev_a"; }],
    ["source_terminal", h => { const hl=h.toLowerCase(); return hl==="term_a"||hl==="src_term"; }],
    ["color", h => /color|colour/i.test(h)],
    ["size", h => /size|sq/i.test(h) && !/source/i.test(h)],
    ["length", h => /length|len\(/i.test(h)],
    ["panel", h => /pnlno|panel/i.test(h)],
    ["sign", h => /sign/i.test(h)],
    ["remarks", h => /remark/i.test(h)],
    ["ref", h => /^refrnce|^ref$/i.test(h)],
  ];
  for (const [k, fn] of rules) {
    const hit = headers.find(fn);
    if (hit) auto[k] = hit;
  }
  return auto;
}
function parseRow(row, headers, mapping) {
  const get = (sys) => {
    const col = mapping[sys]; if (!col) return "";
    const idx = headers.indexOf(col); if (idx < 0) return "";
    return String(row[idx]??"").trim();
  };
  let srcDev = get("source_device"), srcTerm = get("source_terminal");
  let ferrule = get("ferrule");
  let source = "", destination = "";
  if (srcDev && srcTerm) {
    source = `${srcDev}:${srcTerm}`;
    destination = farEndOfPair(ferrule, source) || "";
  }
  let dstDev="", dstTerm="";
  if (destination.includes(":")) {
    const p = destination.split(":");
    dstDev = p.slice(0,-1).join(":");
    dstTerm = p[p.length-1];
  }
  return { sno: get("sno"), source, destination, srcDev, srcTerm, dstDev, dstTerm, ferrule, color: get("color") };
}

const file = "C:\\Users\\sathe\\OneDrive\\Desktop\\wring_frame\\ENOWA Mobile Substation\\=H00+R.xlsx";
const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["WIRING SCHEDULE"], { header: 1, defval: "" });
const headers = rows[0].map(h => String(h||"").trim());
const mapping = buildAuto(headers);
console.log("AUTO_MAPPING", JSON.stringify(mapping, null, 2));
const cables = [];
for (let i = 1; i < rows.length; i++) {
  const c = parseRow(rows[i], headers, mapping);
  if (!c.ferrule && !c.source) continue;
  cables.push(c);
}
console.log("CABLES", cables.length);
console.log("SAMPLE", JSON.stringify(cables.slice(0,5), null, 2));
const missingDst = cables.filter(c => !c.destination).length;
console.log("missing_destination", missingDst);
console.log("ok_pct", ((cables.length-missingDst)/cables.length*100).toFixed(1)+"%");
