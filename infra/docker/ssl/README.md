# TLS certificates for Nginx container

Mount files here as `fullchain.pem` and `privkey.pem` (see `docker-compose.yml`).

## Staging / bootstrap (self-signed)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=dwes.example.com"
```

## Production (Let's Encrypt)

Use the `certbot` compose profile after DNS points to the VM:

```bash
docker compose -f infra/docker/docker-compose.yml --profile certbot run --rm certbot \
  certonly --webroot -w /var/www/certbot -d dwes.example.com --agree-tos -m admin@example.com
```

Copy issued certs into this folder or adjust compose volume mounts to `/etc/letsencrypt/live/...`.
