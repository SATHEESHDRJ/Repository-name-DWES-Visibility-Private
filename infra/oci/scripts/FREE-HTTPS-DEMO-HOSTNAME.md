# Free HTTPS demo hostname

**Production domain:** `dwes.ingenious-network.com` → **`193.123.79.209`** (confirm with `nslookup` before TLS).

Optional sslip.io (no signup):

| Placeholder | Value for this VM |
|-------------|-------------------|
| `<SERVER_PUBLIC_IP>` | `193.123.79.209` |
| `<FREE_HOSTNAME>` | `193.123.79.209.sslip.io` |
| `<SSH_USER>` | `ubuntu` |
| `<PRIVATE_KEY_PATH>` | `C:\Users\sathe\OneDrive\Desktop\DWES\.oci-ssh\ssh-key-2026-07-20.key` |
| `<PUBLIC_KEY_PATH>` | `C:\Users\sathe\OneDrive\Desktop\DWES\.oci-ssh\ssh-key-2026-07-20.key.pub` |
| `<PROJECT_PATH>` | `C:\Users\sathe\OneDrive\Desktop\DWES` |

Canonical SSH/deploy steps: **`OCI-CURRENT-TARGET.md`**.

## Verify DNS before SSL

```powershell
nslookup dwes.ingenious-network.com
nslookup 193.123.79.209.sslip.io
```

Company domain must return **`193.123.79.209`**. Then (HTTPS deploy — not before DNS OK):

```powershell
powershell -ExecutionPolicy Bypass -File "<PROJECT_PATH>\infra\oci\scripts\deploy-demo-from-windows.ps1" -PublicIp 193.123.79.209 -Domain dwes.ingenious-network.com
```

sslip.io alternative:

```powershell
powershell -ExecutionPolicy Bypass -File "<PROJECT_PATH>\infra\oci\scripts\deploy-demo-from-windows.ps1" -PublicIp 193.123.79.209 -Domain 193.123.79.209.sslip.io
```

Env templates: `infra/docker/.env.production.example` (company domain), `infra/docker/.env.demo-sslip.example` (sslip.io).  
TLS uses `infra/oci/scripts/init-letsencrypt.sh` + certbot renew in compose — **only after SSH + DNS confirmed**.
