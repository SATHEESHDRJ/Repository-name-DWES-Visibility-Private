import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accountForRole, accountForUsername } from "./demo-account-loader.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.DWES_API_BASE || "http://127.0.0.1:3001/api";
const ENOWA_DIR = process.env.DWES_ENOWA_DIR || "C:\\Users\\sathe\\OneDrive\\Desktop\\wring_frame\\ENOWA Mobile Substation";
const DRAWING_DIR = process.env.DWES_DRAWING_DIR || "C:\\Users\\sathe\\OneDrive\\Desktop\\Drawing";
const TRACK = path.join(ROOT, ".overnight-enowa-demo.json");

const PANELS = [
  { name: "=H00+R", voltage_level: "33kV", panel_type: "BUSBAR PROTECTION", xlsx: "=H00+R.xlsx", drawing: "33kV BUSBAR PROTECTION PANEL (=H00+R).pdf" },
  { name: "=T601+R1", voltage_level: "67MVA", panel_type: "TRAFO PROTN SET-1", xlsx: "=T601+R1.xlsx", drawing: "67MVA TRAFO. PROTN. PANEL SET-1 (=T601+R1)_.pdf" },
];

const ENOWA_MAPPING = {
  sno: "S.NO", panel: "PNLNO_A", ferrule: "IEC_FERR_A", source_device: "DEV_TBLK_A",
  source_terminal: "TERM_A", color: "WIRE COLOR", size: "WIRE SIZE", length: "LENGTH(m)",
  sign: "SIGN MARK", remarks: "REMARKS", ref: "REFRNCE_A",
};

const log = (...a) => console.log("[overnight]", ...a);

async function apiJson(pathname, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status}: ${typeof data?.message === "string" ? data.message : text.slice(0, 280)}`);
  return data;
}

async function loginAs(kind) {
  const account = ["tech1","supervisor1","sysadmin","ops_director1","director1"].includes(kind)
    ? accountForUsername(kind) : accountForRole(kind);
  const body = await apiJson("/auth/login", { method: "POST", body: { username: account.username, password: account.password } });
  if (!body?.access_token) throw new Error("login failed for " + account.username);
  return { token: body.access_token, user: body.user, account };
}

async function uploadWiring(token, projectCode, frameId, xlsxPath) {
  const buf = fs.readFileSync(xlsxPath);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), path.basename(xlsxPath));
  fd.append("sheet_name", "WIRING SCHEDULE");
  fd.append("mapping", JSON.stringify(ENOWA_MAPPING));
  fd.append("header_row", "0");
  if (frameId) fd.append("frame_id", frameId);
  return apiJson(`/upload/wiring-schedule-mapped/${encodeURIComponent(projectCode)}`, { method: "POST", token, body: fd });
}

async function uploadDrawing(token, projectCode, frameId, pdfPath) {
  if (!fs.existsSync(pdfPath)) { log("SKIP drawing missing", pdfPath); return null; }
  const buf = fs.readFileSync(pdfPath);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), path.basename(pdfPath));
  fd.append("frame_id", frameId);
  try { return await apiJson(`/upload/drawing/${encodeURIComponent(projectCode)}`, { method: "POST", token, body: fd }); }
  catch (e) { log("Drawing warn:", e.message); return null; }
}

async function main() {
  const report = {
    started_at: new Date().toISOString(), api: API, project: null, panels: [], twin_checks: [], wiring_actions: [], submit: null, errors: [],
    demo_users: { supervisor: "supervisor1", technician: "tech1", director: "ops_director1" },
  };
  try { log("health", await apiJson("/health")); } catch (e) { log("health fail", e.message); }

  await loginAs("supervisor1");
  log("supervisor OK");
  const admin = await loginAs("sysadmin").catch(() => null);
  let techId = null;
  if (admin) {
    const users = await apiJson("/admin/users", { token: admin.token }).catch(() => []);
    const list = Array.isArray(users) ? users : (users?.users || []);
    techId = list.find(u => u.username === "tech1")?.id;
  }
  if (!techId) techId = (await loginAs("tech1")).user?.id;
  if (!techId) throw new Error("tech1 id missing");
  log("techId", techId);

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  const code = "ENOWA_DEMO_" + stamp;
  const sup = await loginAs("supervisor1");
  const created = await apiJson("/projects", {
    method: "POST", token: sup.token,
    body: {
      code, client: "ENOWA", name: "ENOWA Mobile Substation - Overnight Demo",
      description: "Overnight autonomous demo using Desktop ENOWA Excel + drawings.",
      sequence: 900,
      panels: PANELS.map(p => ({ name: p.name, voltage_level: p.voltage_level, panel_type: p.panel_type })),
    },
  });
  report.project = { code: created.code || code, name: created.name };
  log("project", report.project.code);

  let frameList = await apiJson(`/projects/${encodeURIComponent(report.project.code)}/frames`, { token: (await loginAs("supervisor1")).token }).catch(() => []);
  if (!Array.isArray(frameList)) frameList = frameList?.frames || [];
  log("frames", frameList.length);

  for (let pi = 0; pi < PANELS.length; pi++) {
    const panelSpec = PANELS[pi];
    const frame = frameList.find(f => String(f.panel_name || f.name || "") === panelSpec.name)
      || frameList.find(f => String(f.panel_name || "").includes(panelSpec.name.replace("=", "")))
      || frameList[pi];
    if (!frame) { report.errors.push("no frame for " + panelSpec.name); continue; }
    const frameId = frame.id || frame.frame_id;
    const xlsxPath = path.join(ENOWA_DIR, panelSpec.xlsx);
    if (!fs.existsSync(xlsxPath)) { report.errors.push("missing " + xlsxPath); continue; }
    log("upload", panelSpec.xlsx, "->", frameId);
    const uploaded = await uploadWiring((await loginAs("supervisor1")).token, report.project.code, frameId, xlsxPath);
    log("cables", uploaded?.cable_count || uploaded?.message || "ok");
    await uploadDrawing((await loginAs("supervisor1")).token, report.project.code, frameId, path.join(DRAWING_DIR, panelSpec.drawing));
    const assignment = await apiJson("/tech/assign-frame", {
      method: "POST", token: (await loginAs("supervisor1")).token,
      body: { project_code: report.project.code, frame_id: frameId, technician_id: techId },
    });
    const assignmentId = assignment?.id || assignment?.assignment?.id || assignment?.assignment_id;
    log("assigned", assignmentId);
    if (assignmentId) {
      await apiJson("/supervisor/approve-assignment/" + assignmentId, { method: "POST", token: (await loginAs("supervisor1")).token }).catch(e => log("approve warn", e.message));
    }
    try {
      const twin = await apiJson("/engineering/operational-twin/" + encodeURIComponent(report.project.code) + "/" + encodeURIComponent(frameId) + "?cableRef=1", { token: (await loginAs("supervisor1")).token });
      report.twin_checks.push({
        panel: panelSpec.name, mode: twin?.drawingMode, routeLabel: twin?.routeLabel, activeSno: twin?.activeWire?.sno,
        source: twin?.activeWire?.sourceLabel || twin?.wireStatusHint?.source,
        destination: twin?.activeWire?.destinationLabel || twin?.wireStatusHint?.destination,
        wireCount: twin?.wires?.length ?? 0,
      });
      log("twin S.1", twin?.wireStatusHint?.source, "->", twin?.wireStatusHint?.destination);
    } catch (e) { report.errors.push("twin " + panelSpec.name + ": " + e.message); }
    report.panels.push({ name: panelSpec.name, frameId, assignmentId, xlsx: panelSpec.xlsx, cables: uploaded?.cable_count });
  }

  const primary = report.panels[0];
  if (primary?.assignmentId) {
    const tech = await loginAs("tech1");
    await apiJson("/tech/start/" + primary.assignmentId, { method: "POST", token: tech.token });
    report.wiring_actions.push({ action: "start", ok: true });
    for (let i = 0; i < 3; i++) {
      await apiJson("/tech/cable-action", { method: "POST", token: tech.token, body: { assignment_id: primary.assignmentId, cable_index: i, action: "complete" } });
      report.wiring_actions.push({ action: "complete", cable_index: i, ok: true });
      try {
        const twin = await apiJson("/engineering/operational-twin/" + encodeURIComponent(report.project.code) + "/" + encodeURIComponent(primary.frameId) + "?cableRef=" + (i + 2), { token: tech.token });
        report.twin_checks.push({ after: "complete_" + i, activeSno: twin?.activeWire?.sno, source: twin?.wireStatusHint?.source, destination: twin?.wireStatusHint?.destination, wires: twin?.wires?.length });
      } catch (e) { report.errors.push("twin after " + i + ": " + e.message); }
    }
    await apiJson("/tech/cable-action", { method: "POST", token: tech.token, body: { assignment_id: primary.assignmentId, cable_index: 3, action: "skip", note: "[SKIPPED overnight-demo] Temporary access blocked" } });
    report.wiring_actions.push({ action: "skip", cable_index: 3, ok: true });
    try {
      await apiJson("/tech/pause/" + primary.assignmentId, { method: "POST", token: tech.token, body: { reason: "Break overnight demo" } });
      report.wiring_actions.push({ action: "pause", ok: true });
      await apiJson("/tech/resume/" + primary.assignmentId, { method: "POST", token: tech.token });
      report.wiring_actions.push({ action: "resume", ok: true });
    } catch (e) { report.errors.push("pause/resume: " + e.message); }
  }

  try {
    report.submit = await apiJson("/projects/" + encodeURIComponent(report.project.code) + "/submit-to-director", { method: "POST", token: (await loginAs("supervisor1")).token });
  } catch (e) { report.submit = { error: e.message }; }

  report.finished_at = new Date().toISOString();
  fs.writeFileSync(TRACK, JSON.stringify(report, null, 2) + "\n");
  log("wrote", TRACK);
  console.log(JSON.stringify({ ok: report.errors.length === 0, project: report.project, panels: report.panels, twin: report.twin_checks.slice(0, 4), actions: report.wiring_actions, errors: report.errors, submit: report.submit }, null, 2));
}

main().catch(err => { console.error("OVERNIGHT_E2E_FAIL", err.message); process.exit(1); });