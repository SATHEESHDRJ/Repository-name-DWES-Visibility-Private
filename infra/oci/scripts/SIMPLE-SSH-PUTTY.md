# Simple OCI SSH — instance **ingenious-dwes-prod-maintenance-01**, site **https://dwes.ingenious-network.com**

Instance: **ingenious-dwes-prod-maintenance-01** · Region: **me-dubai-1** · User: **ubuntu** · IP: **193.123.79.209**

Canonical reference: **`OCI-CURRENT-TARGET.md`**

Keys on PC (gitignored): `C:\Users\sathe\OneDrive\Desktop\DWES\.oci-ssh\`

| File | Purpose |
|------|---------|
| `ssh-key-2026-07-20.key` (+ `.pub`) | Current instance SSH login key |
| `ingenious-dwes-prod-01.ppk` / `dwes-demo-oci.ppk` | Legacy PuTTY names (convert from current key in PuTTYgen) |

---

## Step 1 — Verify SSH (Windows)

```powershell
ssh -i "C:\Users\sathe\OneDrive\Desktop\DWES\.oci-ssh\ssh-key-2026-07-20.key" -o IdentitiesOnly=yes ubuntu@193.123.79.209
```

Or double-click **`test-demo-ssh.bat`** (IP + domain).

---

## Step 2 — PuTTYgen → `.ppk` (optional)

1. **PuTTYgen** → **Conversions** → **Import key** → `ssh-key-2026-07-20.key`  
2. **Save private key** → `.oci-ssh\dwes-demo-oci.ppk` (or instance-named `.ppk`)

---

## Step 3 — PuTTY login

**GUI:** Host `193.123.79.209`, port `22`, user `ubuntu`, Auth → `.ppk`

**Or double-click:** **`open-demo-vm-putty.bat`**

---

## Step 4 — Deploy DWES

After SSH works and DNS **`dwes.ingenious-network.com`** → **`193.123.79.209`**:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\sathe\OneDrive\Desktop\DWES\infra\oci\scripts\deploy-demo-from-windows.ps1" -PublicIp 193.123.79.209 -Domain dwes.ingenious-network.com
```

IP-only smoke before TLS:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\sathe\OneDrive\Desktop\DWES\infra\oci\scripts\deploy-demo-from-windows.ps1" -PublicIp 193.123.79.209 -IpOnly
```

Do **not** run Certbot until SSH and DNS are both confirmed.