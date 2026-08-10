#!/usr/bin/env python3
"""Regenerate CLOUDSHELL-PASTE-ADD-SSH.txt (UTF-8) from cloudshell-inject-ssh-via-agent.sh."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PUB_PATH = ROOT / ".oci-ssh" / "ssh-key-2026-07-20.key.pub"
if not PUB_PATH.is_file():
    PUB_PATH = ROOT / ".oci-ssh" / "dwes-demo-oci.pub"
OUT = Path(__file__).with_name("CLOUDSHELL-PASTE-ADD-SSH.txt")

header = """# PASTE INTO ORACLE CLOUD SHELL (not Windows PowerShell)
# Developer -> Cloud Shell | region me-dubai-1
# Wait for status=SUCCEEDED and PUBLIC_IP=...

"""

body = Path(__file__).with_name("cloudshell-inject-ssh-via-agent.sh").read_text(encoding="utf-8")
# Cloud Shell one-liner: pipe script via stdin
script_escaped = body.replace("\\", "\\\\").replace('"', '\\"')
# Use heredoc with inject script content instead of duplicating logic
content = (
    header
    + "cat <<'INJECT_SCRIPT' | bash\n"
    + body
    + "\nINJECT_SCRIPT\n"
)

import io
with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes UTF-8)")
