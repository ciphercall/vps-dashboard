# Development

## Prerequisites

- Node.js 20+
- npm
- (Optional) Docker + Compose for container parity

## Setup

```bash
git clone https://github.com/ciphercall/vps-dashboard.git
cd vps-dashboard
npm ci
cp deploy/.env.example .env 2>/dev/null || true
```

Create a `.env` (or export vars) with at minimum:

```bash
ADMIN_USER=admin
ADMIN_PASS=admin
SESSION_SECRET=dev-secret-at-least-32-chars-long
PORT=5173
VPS_IP=169.58.90.13
PROJECTS_CONFIG=./config/projects.json
DB_PATH=./data/dashboard.db
```

## Run

```bash
npm run dev          # Vite dev server (HMR)
npm run build        # production build (adapter-node → build/)
npm run preview      # preview the production build
```

## Type checking / lint

```bash
npm run check        # svelte-check
npm run lint         # eslint (if configured)
```

## Tests

```bash
npm test             # unit + integration (vitest)
```

Changed areas to cover:
- `metrics.ts` — host env handling, caching
- `ingest.ts` — CLF parsing, rotation detection
- `auth.ts` — sign/verify
- `gatekeeper.ts` — mocked HTTP

## Project structure

```
vps-dashboard/
├── .github/workflows/deploy.yml
├── config/projects.json
├── deploy/docker-compose.yml
├── deploy/.env.example
├── docs/
├── src/
│   ├── app.css
│   ├── app.html
│   ├── hooks.server.ts
│   ├── lib/
│   │   ├── server/        # auth, db, metrics, docker, gatekeeper, ingest, projects
│   │   ├── components/    # Gauge, ProjectRow, StatusBadge, CountryFlag
│   │   └── types.ts
│   └── routes/            # +page, login, logout, api/*
├── package.json
├── svelte.config.js
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
├── Dockerfile
└── README.md
```

## Working with host mounts locally

To test metrics locally, point env vars at the host:

```bash
HOST_PROC=/proc HOST_SYS=/sys HOST_FS=/ npm run dev
```

For log ingestion locally, point `logSources` at a real access log and ensure the path is
readable.

## Conventions

- Svelte 5 runes (`$state`, `$derived`, `$effect`) — no legacy reactive statements.
- TailwindCSS 4 with theme tokens in `app.css`.
- Server-only modules live under `src/lib/server/` and are never imported by client code.
- No edits to gatekeeper or target projects; consume public endpoints only.

## Debugging

- Dashboard logs: `docker logs -f vps-dashboard` (container) or stdout (dev).
- SQLite inspection: `sqlite3 /data/dashboard.db` (or `./data/dashboard.db` in dev).
- Network: `curl -s http://127.0.0.1:8030/api/projects | jq`.
