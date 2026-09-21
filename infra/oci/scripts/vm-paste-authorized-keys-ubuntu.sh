# Paste ONCE on the OCI VM via Instance Console Connection serial shell.
# Fingerprint SHA256:66QgKMVlP7GhotPdINa1sbg8RDnEjJRk+tfqIj4QaNk
# Matches Windows private key: .oci-ssh/ssh-key-2026-07-20.key
# Target: /home/ubuntu/.ssh/authorized_keys only (not /root)

set -eo pipefail
PUB='ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDE7j2gGxIRWBiSS/qm7pXuoSqvsB4HB36qe5L8b4ZlBaFAZfz5CgtoYYm8Z5YXONA8srfzAqhYDtUDkctH7nev6HH4xWBO5BsbFO3p1FCgGXDaalSVpB5v2IdKDlsyneTFXbt7yHKUVz3C1bJk6hpyAlkXH95aarEo06eTUD2eycQpZg9T946sBDIlT02vkh7dX67gFbEiyJ+5ANpkfTqE8ZhP9J4K6y3mVTzDCk3cW57q6o3xcgASzmifjm1HhNjGGqDd5OnDjGQ99wu30UF9pL7ylUiqXtDMB7U+V+NYJfz4RN2hEth8HFqGuYCKZ5qslhsLju7FyYDmi7HsgBPb ssh-key-2026-07-20'
MARKER='AAAAB3NzaC1yc2EAAAADAQABAAABAQDE7j2gG'
sudo mkdir -p /home/ubuntu/.ssh
sudo chmod 700 /home/ubuntu/.ssh
sudo touch /home/ubuntu/.ssh/authorized_keys
sudo chmod 600 /home/ubuntu/.ssh/authorized_keys
sudo grep -qF "$MARKER" /home/ubuntu/.ssh/authorized_keys \
  || echo "$PUB" | sudo tee -a /home/ubuntu/.ssh/authorized_keys >/dev/null
sudo chown -R ubuntu:ubuntu /home/ubuntu/.ssh
sudo chmod 700 /home/ubuntu/.ssh
sudo chmod 600 /home/ubuntu/.ssh/authorized_keys
grep -F "$MARKER" /home/ubuntu/.ssh/authorized_keys && echo DONE_SSH_KEY_ubuntu
