import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(path.join(ROOT, "e2e", "package.json"));
const { chromium } = require("playwright");
const OUT = path.join(ROOT, "docs/evidence/nogo-remediation-2026-09-21_090437/phase6/after-gallery");
const BASE = "http://127.0.0.1:5275";
const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];
const ROLES = [
  { folder: "director", user: "director1", pass: "dir123", path: "/director" },
  { folder: "sysadmin", user: "sysadmin", pass: "admin123", path: "/admin" },
];
async function login(page, user, pass) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="text"], input[name="username"]', user);
  await page.fill('input[type="password"]', pass);
  await page.waitForSelector("button.login-btn:not([disabled])", { timeout: 60000 });
  await page.click("button.login-btn");
  await page.waitForTimeout(2500);
}
const browser = await chromium.launch({ headless: true });
for (const role of ROLES) {
  const dir = path.join(OUT, role.folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const vp of VIEWPORTS) {
    await new Promise((r) => setTimeout(r, 8000));
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    try {
      await login(page, role.user, role.pass);
      await page.goto(BASE + role.path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
      await page.waitForTimeout(1500);
      const file = path.join(dir, vp.name + ".png");
      await page.screenshot({ path: file, fullPage: false });
      console.log("OK", role.folder, vp.name);
    } catch (e) {
      console.error("FAIL", role.folder, vp.name, e.message);
      fs.writeFileSync(path.join(dir, vp.name + ".ERROR.txt"), String(e.stack || e));
    }
    await context.close();
  }
}
await browser.close();
console.log("GALLERY_REMAINING_DONE");
