# Deployment

## VPS target

- Host: `169.58.90.13` (Contabo Cloud VPS 6, Ubuntu 24.04.5 LTS)
- Port: `8030/tcp` (public, always-on container)
- Install dir: `/opt/github/vps-dashboard`
- Deploy script: `/opt/deploy-vps-dashboard.sh`
- CI/CD: GitHub Actions on push to `main`

## VPS deploy steps

```bash
# 1. Clone
mkdir -p /opt/github
git clone https://github.com/ciphercall/vps-dashboard.git /opt/github/vps-dashboard
cd /opt/github/vps-dashboard

# 2. Create env (never commit)
cat > deploy/.env <<'EOF'
ADMIN_USER=admin
ADMIN_PASS=<generated strong password>
SESSION_SECRET=<random 32+ chars>
NODE_ENV=production
PORT=8030
VPS_IP=169.58.90.13
PROJECTS_CONFIG=/app/config/projects.json
DB_PATH=/data/dashboard.db
HOST_PROC=/host/proc
HOST_SYS=/host/sys
HOST_FS=/host/root
EOF
chmod 600 deploy/.env

# 3. Firewall
ufw allow 8030/tcp

# 4. Deploy script
cat > /opt/deploy-vps-dashboard.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/github/vps-dashboard
git pull --ff-only
docker compose -f deploy/docker-compose.yml --env-file deploy/.env build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
EOF
chmod +x /opt/deploy-vps-dashboard.sh

# 5. Run
/opt/deploy-vps-dashboard.sh

# 6. Verify
curl -s http://127.0.0.1:8030/healthz
curl -I http://169.58.90.13:8030/
docker ps --format '{{.Names}} {{.Status}}' | grep vps-dashboard
```

## `deploy/docker-compose.yml`

```yaml
services:
  dashboard:
    build: { context: .., dockerfile: Dockerfile }
    container_name: vps-dashboard
    network_mode: host
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=8030
      - HOST_PROC=/host/proc
      - HOST_SYS=/host/sys
      - HOST_FS=/host/root
      - VPS_IP=169.58.90.13
      - ADMIN_USER=${ADMIN_USER}
      - ADMIN_PASS=${ADMIN_PASS}
      - SESSION_SECRET=${SESSION_SECRET}
      - PROJECTS_CONFIG=/app/config/projects.json
      - DB_PATH=/data/dashboard.db
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/host/root:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /var/log:/host/log:ro
      - /opt/github:/host/github:ro
      - dashboard-data:/data
volumes:
  dashboard-data:
```

## Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "build/index.js"]
```

## Finalising `logSources`

After first deploy, inspect VPS logs to find real access-log paths:

```bash
ls -la /var/log/nginx/ 2>/dev/null
find /opt/github -name 'access.log' 2>/dev/null
docker ps --format '{{.Names}}'
```

Update `config/projects.json` `logSources` accordingly, commit, push (CI redeploys) or run
the deploy script manually.

## CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`:

```yaml
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: /opt/deploy-vps-dashboard.sh
```

Secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` are already configured in the other repos.

## Health check

```bash
curl -s http://127.0.0.1:8030/healthz   # → 200
curl -I http://169.58.90.13:8030/       # → 200 (login page)
```

## Rollback

```bash
cd /opt/github/vps-dashboard
git log --oneline -5
git checkout <previous-sha>
/opt/deploy-vps-dashboard.sh
```

To preserve data, the SQLite DB lives in the named volume `dashboard-data` and survives
image rebuilds.

## HTTPS

No TLS initially. Options:
- Cloudflare Tunnel pointing at `http://127.0.0.1:8030`.
- nginx reverse proxy with Let's Encrypt in front of port 8030.

## Verifying gatekeepers still work

After deploy, confirm the on-demand flow is untouched:

```bash
curl -s http://169.58.90.13:8023/_ondemand/status
curl -s http://169.58.90.13:5174/_ondemand/status
```

Test a cold start of gazi-portfolio and idle teardown; the dashboard only calls public
endpoints and never edits gatekeeper config.
