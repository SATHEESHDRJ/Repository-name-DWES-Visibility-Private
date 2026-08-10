# DWES fix: Fingerprint / WebAuthn on LAN

## Problem

Fingerprint enrollment failed on LAN with:

- `The RP ID "192.168.0.165" is invalid for this domain`
- "You must be signed in to enable it."

**Root cause:** WebAuthn requires a valid hostname RP ID and a secure context (HTTPS). A raw LAN IP on `http://` cannot work.

## Solution

1. Serve over **hostname + HTTPS** (`dwes.local`, not IP) via existing `dev:https` tooling.
2. **Config-driven** `RP_ID` / `RP_ORIGIN` in `backend/.env` — never hardcode LAN IPs.
3. **Session required** for enrollment (`JwtAuthGuard` + frontend token check).
4. **Graceful fallback** UI when origin is unsupported (IP / insecure HTTP).

## User setup (LAN)

### Server PC

```bash
npm install
npm run certs:trust          # optional but recommended on Windows dev PC
npm run dev:https
```

### backend/.env

```env
RP_ID=dwes.local
RP_ORIGIN=https://dwes.local:5173
RP_NAME=DWES
```

Restart backend after editing.

### Hosts file (server + each enrolling device)

Windows (`C:\Windows\System32\drivers\etc\hosts` as Administrator):

```
192.168.0.165  dwes.local
```

Use your PC's actual LAN IP.

### Open in browser

**https://dwes.local:5173** — not `http://192.168.0.165:5173`.

## Env vars

| Variable | Where | Purpose |
|----------|-------|---------|
| `RP_ID` | `backend/.env` | WebAuthn hostname (e.g. `dwes.local`, `localhost`) |
| `RP_ORIGIN` | `backend/.env` | `https://hostname:port` (comma-separated for multiple) |
| `RP_NAME` | `backend/.env` | Display name (`DWES`) |
| `DWES_HOSTNAME` | shell / scripts | Cert SAN + docs (default `dwes.local`) |
| `VITE_DWES_HOSTNAME` | optional frontend | Fallback URL in UI messages |

## Files changed

- `backend/src/auth/webauthn-config.ts` — centralized RP config + validation
- `backend/src/auth/webauthn.service.ts` — multi-origin verify, public config
- `backend/src/auth/webauthn.controller.ts` — `GET /api/auth/webauthn/config`
- `backend/.env`, `backend/.env.example` — hostname-based RP settings
- `src/utils/webauthnSupport.ts` — origin checks + friendly errors
- `src/hooks/useBiometric.ts` — context gate, auth check, error mapping
- `src/components/biometric/BiometricSettings.tsx` — fallback + signed-in messaging
- `src/components/layout/Topbar.tsx` — show settings on bad origin (notice)
- `scripts/dwes-hostname.mjs`, `generate-certs.mjs`, `print-lan-url.mjs`
- `DEPLOY-LAN.md` — updated LAN + WebAuthn instructions

## Verify

- [ ] `https://dwes.local:5173` loads without RP ID browser error
- [ ] Signed-in admin can enable fingerprint → credential stored
- [ ] Fingerprint sign-in works on enrolled device
- [ ] `http://192.168.x.x:5173` shows friendly message; password login works
- [ ] `npm run build` (frontend) exits 0
- [ ] `npm run build` (backend) exits 0
