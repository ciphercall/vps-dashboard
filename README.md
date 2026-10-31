# VPS Operations Dashboard

A single full-stack [SvelteKit](https://kit.svelte.dev) app that gives one consolidated view of
VPS health, deployed project status, on-demand gatekeeper control, and per-project visitor
analytics. It runs always-on on the VPS on port `8030` and consumes only the **public HTTP
endpoints** of the existing on-demand gatekeepers — nothing in those projects is modified.

## What it shows

- **VPS config panel** — hostname, IP, OS, CPU cores, RAM, disk, region, provider, Docker
  version, container count, uptime.
- **Animated gauges** — CPU, memory, disk with green/amber/red thresholds.
- **Projects table** — live awake/asleep status, gatekeeper state, Deploy / Teardown / Redeploy
  controls (with confirmation), auto-refresh every 10 s.
- **Visitor analytics** — expandable per-project row with a nested paginated visit table
  (timestamp, IP with local/proxy labeling, country flag, country, path, user agent) plus
  today / 7-day summaries and top countries.
- **Build / deploy progress** — right-side panel streaming a project's readiness to become
  browsable (Vercel-style timestamped log, progress bar, browsable yes/no) via the gatekeeper
  SSE endpoint; also shows redeploy progress.

## Stack

SvelteKit 2 + Svelte 5 (runes) + `adapter-node`, TailwindCSS 4, TypeScript, Node 20.
Backend reads `/proc` via `systeminformation` and shells out to `docker`. Visitor country is
resolved offline with `geoip-lite`. Visits are stored in SQLite (`better-sqlite3`).

## Quick start (local)

```bash
git clone https://github.com/ciphercall/vps-dashboard.git
cd vps-dashboard
npm ci
cp deploy/.env.example deploy/.env   # or create .env at repo root for dev
# edit .env: set ADMIN_USER, ADMIN_PASS, SESSION_SECRET
npm run dev
```

Open `http://localhost:5173`, sign in with `ADMIN_USER` / `ADMIN_PASS`.

For a production-style local run:

```bash
npm run build
PORT=8030 node build/index.js
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ADMIN_USER` | yes | — | Single admin login username |
| `ADMIN_PASS` | yes | — | Single admin login password |
| `SESSION_SECRET` | yes | — | Signs the `dashboard_session` cookie (32+ chars) |
| `PORT` | no | `3000` | HTTP listen port (VPS uses `8030`) |
| `HOST_PROC` | no | `/proc` | Host `/proc` mount for `systeminformation` |
| `HOST_SYS` | no | `/sys` | Host `/sys` mount |
| `HOST_FS` | no | `/` | Host filesystem root for disk stats |
| `VPS_IP` | no | `169.58.90.13` | Displayed VPS IP (never guessed) |
| `PROJECTS_CONFIG` | no | `config/projects.json` | Path to monitored projects config |
| `DB_PATH` | no | `./data/dashboard.db` | SQLite database file |

## Monitored projects

Projects are declared in `config/projects.json` (no code change needed to add/remove). See
[`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) for the schema.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data flow, modules, host mounts
- [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) — env vars, project schema, adding a project
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — VPS deploy, firewall, CI/CD, rollback
- [`docs/VISITOR_TRACKING.md`](docs/VISITOR_TRACKING.md) — log sources, formats, geoip, beacon
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — local dev, tests, project structure

## Notes

- Gatekeeper instances are never modified; only their public endpoints
  (`/_ondemand/status`, `/_ondemand/deploy`, `/_ondemand/redeploy`, `/_ondemand/teardown`) are
  called with the admin token. Auto-redeploy is surfaced via the gatekeeper's rebuild-stamp
  polling (no dashboard env vars needed).
- No HTTPS initially; front with Cloudflare Tunnel or nginx + Let's Encrypt later.
- Single operator; no multi-user/RBAC in v1.
