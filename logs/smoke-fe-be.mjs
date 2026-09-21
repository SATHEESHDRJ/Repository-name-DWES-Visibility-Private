const fe = await fetch("http://localhost:5175/");
const t = await fe.text();
console.log("FE_STATUS", fe.status);
console.log("HAS_ROOT", t.includes("id=\"root\""));
console.log("TITLE", (t.match(/<title>([^<]+)<\/title>/) || [])[1] || "");
const be = await fetch("http://localhost:3001/api/health");
console.log("BE", await be.json());
