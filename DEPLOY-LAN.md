# DWES — LAN deployment

## Universal Local Network Mode (HTTP — any Wi‑Fi / hotspot / office LAN)

No hardcoded IP. Connect tablets to the **same network** as this PC, start LAN mode, open the printed URL.

```bash
npm run lan
```

Or double‑click: `launchers\START-DWES-LAN.bat`

What this does:

1. Detects the current private LAN IPv4 (`192.168.*` / `10.*` / `172.16–31.*`)
2. Binds Vite (`0.0.0.0:5175`) and Nest (`HOST=0.0.0.0:3001`)
3. Prints Frontend + Backend + Health URLs
4. Tries to ensure Windows Firewall rules (Private profile) for TCP **5175** and **3001**
5. Proxies `/api` through Vite — the browser never needs a hardcoded backend host

Example terminal output:

```text
  Current LAN IP : 192.168.0.42
  Frontend URL   : http://192.168.0.42:5175
  Backend URL    : http://192.168.0.42:3001
  Health         : http://192.168.0.42:3001/api/health
```

| Script | Purpose |
|--------|---------|
| `npm run lan` | Universal Local Network Mode (auto IP + FE/BE) |
| `npm run lan:skip-firewall` | Same, skip firewall helper |
| `npm run lan:firewall` | Create firewall rules (run elevated once) |
| `npm run lan:url` / `lan:url:full` | Print URLs only |

**Switching Wi‑Fi:** stop the stack (Ctrl+C) and run `npm run lan` again — the new IP is detected automatically. No source changes.

**Password login** works on HTTP LAN. **Passkeys / fingerprint** still need HTTPS + hostname — see below.

**Firewall (once, elevated):**

```powershell
npm run lan:firewall
```

---

## HTTPS LAN (fingerprint / WebAuthn)

Deploy DWES on your PC so tablets, phones, and other computers on the same Wi-Fi can access it over **HTTPS**.

## Quick start

```bash
npm install
npm run certs:trust          # once per PC (may prompt for Admin)
npm run hosts:help           # copy hosts line — edit as Administrator
npm run dev:fingerprint      # prints checklist + starts HTTPS on port 5173
```

Or without the checklist banner:

```bash
npm run dev:https
```

This will:

1. Generate TLS certificates (if missing) in `certs/`
2. Start the NestJS backend on port **3001** (HTTP — proxied by Vite)
3. Start the Vite dev server (HTTPS on internal port 5174, proxied through gateway)
4. Start a TCP gateway on port **5173** — HTTP auto-redirects to HTTPS, TLS proxied to Vite
5. Start an HTTP→HTTPS redirect on port **8080** (for LAN devices)

## URLs

Replace `10.198.31.114` with your PC's LAN IP (`npm run lan:url` prints the current addresses).

| Device | URL |
|--------|-----|
| This PC | https://localhost:5173 (or http://localhost:5173 — auto-redirects) |
| Tablet / phone (same Wi-Fi) | https://dwes.local:5173 (recommended for fingerprint) |
| Tablet / phone (IP only) | https://10.198.31.114:5173 (password login only) |
| HTTP redirect (auto-upgrade) | http://10.198.31.114:8080 → https://10.198.31.114:5173 |

Production-style LAN deploy (built assets):

```bash
npm run deploy:lan:https
```

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run certs:generate` | Create/regenerate self-signed certs (localhost + dwes.local + LAN IPs) |
| `npm run certs:trust` | Install mkcert CA + regenerate trusted local certs (this PC) |
| `npm run hosts:help` | Print hosts-file lines for `dwes.local` (Admin required to edit) |
| `npm run fingerprint:setup` | Full checklist: certs, hosts, RP_ORIGIN, URL to open |
| `npm run dev:fingerprint` | Setup checklist + start HTTPS dev stack (recommended for fingerprint) |
| `npm run dev:https` | Dev mode with HTTPS + HTTP redirect + backend |
| `npm run deploy:lan:https` | Build + preview with HTTPS + redirect + backend |
| `npm run lan:url` | Print current HTTPS LAN URLs |
| `npm run redirect:http` | Run HTTP→HTTPS redirect only (port 8080) |

## Certificate trust

### PC (recommended: mkcert)

```bash
npm run certs:trust
```

This runs `mkcert -install` (may prompt for admin) and regenerates certs for `localhost`, `dwes.local`, and your LAN IPs.

If [mkcert](https://github.com/FiloSottile/mkcert) is installed, `certs:generate` also uses it automatically.

### Xiaomi / Android tablet — trusted standalone app

HTTP `http://<LAN_IP>:5175` can be used for normal password-login testing, but Chrome
cannot install it as a true standalone PWA. “Add to Home screen” creates a browser
shortcut, so the Chrome address bar remains visible.

For a standalone app on a Xiaomi/Android tablet:

1. On the laptop run `npm run certs:trust`, then `npm run dev:https`.
2. Run `mkcert -CAROOT` and transfer **only** `rootCA.pem` to the tablet. Never copy
   `rootCA-key.pem`.
3. On Xiaomi HyperOS/Android, install `rootCA.pem` as a **CA certificate** from
   Settings → Security/Privacy → More security settings → Encryption & credentials
   → Install a certificate → CA certificate. Menu wording varies by HyperOS version.
4. Open the printed `https://<LAN_IP>:5173` URL in Chrome. It must show a normal
   trusted lock/connection with no certificate warning.
5. Use Chrome menu → **Install app**, then launch DWES from its home-screen icon.
   The manifest `display: standalone` removes the Chrome address bar.

Remove the development CA from the tablet when LAN testing is finished.

### Untrusted/self-signed certificate limitation

Proceeding through a certificate warning may let a page load, but it does **not**
provide a reliably trusted secure context for service-worker registration,
PWA installation, or WebAuthn. Use the trusted mkcert procedure above.

Regenerate certs after a DHCP IP change:

```bash
npm run certs:generate -- --force
```

## HTTP → HTTPS redirect

| Setting | Default | Notes |
|---------|---------|-------|
| HTTPS app port | **5173** | Vite dev / preview |
| Redirect port | **8080** | Avoids IIS on port **80** |

To use port 80 instead (requires stopping IIS):

```powershell
$env:HTTP_REDIRECT_PORT=80
npm run redirect:http
```

**IIS conflict:** If IIS is bound to port 80, leave the default redirect on **8080** or stop IIS (`iisreset /stop` in an elevated prompt).

## Windows firewall

Allow inbound on **Private** network for Node.js:

- TCP **5173** (HTTPS frontend)
- TCP **3001** (backend — only needed if clients call API directly; Vite proxy usually suffices)
- TCP **8080** (HTTP redirect)

## WebAuthn / fingerprint on LAN

WebAuthn requires **HTTPS** and a **hostname** (not a raw IP like `192.168.x.x`). Use `dwes.local` (default) or another `.local` name.

### 1. Hosts file (each device that uses fingerprint)

Map your PC's LAN IP to the hostname. Replace `10.198.31.114` with your IP (`npm run lan:url:https`).

**Windows** (`C:\Windows\System32\drivers\etc\hosts` — edit as Administrator):

```
10.198.31.114  dwes.local
```

**Android / iPad:** use a hosts-file app, DNS override, or router DNS if available. At minimum, configure the **server PC** and any device enrolling fingerprint.

### 2. backend/.env

```env
RP_ID=dwes.local
RP_ORIGIN=https://dwes.local:5173
RP_NAME=DWES
```

`RP_ID` must match the hostname in the browser address bar (no port). Restart the backend after changes.

For local dev on this PC you can add comma-separated origins:

```env
RP_ORIGIN=https://localhost:5173,https://dwes.local:5173
```

### 3. Start HTTPS stack

```bash
npm run dev:https
```

Open **https://dwes.local:5173** — not `http://192.168.x.x:5173`.

### 4. Enroll

1. Sign in with username + password.
2. Top bar → fingerprint icon → **Enable fingerprint on this device**, or accept the post-login prompt.

Password login always works, including on raw IP / HTTP URLs.

## Architecture

```
Tablet  ──HTTPS:5173──►  Vite (HTTPS)  ──HTTP:3001──►  NestJS (localhost)
         HTTP:8080 ──301──► HTTPS:5173
```

The backend stays on plain HTTP bound to `127.0.0.1:3001` / `0.0.0.0:3001`; external clients only talk to the HTTPS frontend. API calls go through Vite's `/api` proxy.

## Verify (PowerShell)

```powershell
Invoke-WebRequest -Uri https://localhost:5173 -SkipCertificateCheck
Invoke-WebRequest -Uri https://10.198.31.114:5173 -SkipCertificateCheck
Invoke-WebRequest -Uri http://localhost:8080 -MaximumRedirection 0 -ErrorAction SilentlyContinue
# Expect StatusCode 301 with Location: https://...
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `CERT` / connection refused | Run `npm run certs:generate` then restart |
| Wrong IP after Wi-Fi reconnect | `npm run certs:generate -- --force` |
| Port 8080 in use | `$env:HTTP_REDIRECT_PORT=8081` |
| PostCSS error on dev | Already handled in `vite.config.ts` (`css.postcss.plugins: []`) |
| `RP ID "192.168.x.x" is invalid` | Use hostname URL (`https://dwes.local:5173`) + set `RP_ID=dwes.local` |
| Fingerprint button missing on IP | Expected — use hostname URL; password login still works |
