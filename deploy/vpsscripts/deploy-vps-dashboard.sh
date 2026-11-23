#!/bin/bash
set -e
cd /opt/github/vps-dashboard

# The live config carries real gatekeeper tokens while the tracked file ships
# placeholders, so a pull is only meaningful together with the re-sync. Run both,
# and fail loudly: the previous `git pull || true` hid an assume-unchanged flag
# for weeks and the dashboard never updated.
git fetch origin main
git reset --hard origin/main
bash /opt/sync-dashboard-tokens.sh

docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

# Each build retags deploy-dashboard:latest, so the superseded image becomes
# dangling. `-a` is never used: it would delete the images of the on-demand
# stacks, which their gatekeepers need in order to cold-start them.
docker image prune -f >/dev/null 2>&1 || true
