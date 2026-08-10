const fs = require("fs");
const path = require("path");
const docs = path.join(__dirname, "..", "docs");
const handoff = path.join(__dirname, "handoff");

const map = [
  ["DWES-LIVE-3D-TWIN-PROJECT-COMPLETION-REPORT.md", "live3d.md"],
  ["DWES-PANEL-COMPLETION-REPORT-GUIDE.md", "panel-guide.md"],
  ["LIVE-3D-TWIN-POST-IMPLEMENTATION-FINAL-REPORT.md", "post-impl.md"],
];

const sizes = {};
for (const [dest, src] of map) {
  const body = fs.readFileSync(path.join(handoff, src), "utf8");
  const out = path.join(docs, dest);
  fs.writeFileSync(out, body, { encoding: "utf8" });
  sizes[dest] = fs.statSync(out).size;
}

const hardeningName = "DWES-WHOLE-PROJECT-HARDENING-FINAL-REPORT.md";
const hardeningPath = path.join(docs, hardeningName);
let hardening = fs.readFileSync(hardeningPath, "utf8");
if (!hardening.includes("## Automated test matrix")) {
  const append = fs.readFileSync(path.join(handoff, "hardening-append.md"), "utf8");
  hardening = hardening.trimEnd() + append;
  fs.writeFileSync(hardeningPath, hardening, { encoding: "utf8" });
}
sizes[hardeningName] = fs.statSync(hardeningPath).size;

console.log(JSON.stringify(sizes, null, 2));
