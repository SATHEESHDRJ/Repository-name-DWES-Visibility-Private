# TLS certificates for Nginx container

Nginx reads `${DATA_ROOT}/ssl/nginx/fullchain.pem` and `privkey.pem` (see `docker-compose.yml`).

## Staging / bootstrap (self-signed)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=dwes.example.com"
```

## Production (Let's Encrypt)

After DNS points to the VM:

```bash
bash infra/oci/scripts/init-letsencrypt.sh
```

Renewal:

- Certbot profile copies PEMs on renew via `infra/docker/scripts/certbot-deploy-hook.sh`
- Host reload: `bash infra/docker/scripts/sync-letsencrypt-to-nginx.sh` (also weekly cron on VM)
