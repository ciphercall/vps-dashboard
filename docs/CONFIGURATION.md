# Configuration

## Environment variables

All runtime configuration comes from the environment (`.env` in `deploy/` on the VPS).

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_USER` | yes | — | Login username |
| `ADMIN_PASS` | yes | — | Login password |
| `SESSION_SECRET` | yes | — | 32+ char secret used to sign the session cookie |
| `PORT` | no | `3000` | Listen port (`8030` on the VPS) |
| `NODE_ENV` | no | — | Set to `production` in deploy |
| `HOST_PROC` | no | `/proc` | Path to host `/proc` |
| `HOST_SYS` | no | `/sys` | Path to host `/sys` |
| `HOST_FS` | no | `/` | Host filesystem root for disk stats |
| `VPS_IP` | no | `169.58.90.13` | Displayed VPS IP |
| `PROJECTS_CONFIG` | no | `config/projects.json` | Path to monitored projects config |
| `DB_PATH` | no | `./data/dashboard.db` | SQLite database file path |

## `config/projects.json` schema

```json
[
  {
    "id": "gazi-portfolio",
    "name": "Gazi Portfolio",
    "publicUrl": "http://169.58.90.13:8023",
    "healthUrl": "http://127.0.0.1:8026/api/health",
    "gatekeeper": {
      "baseUrl": "http://127.0.0.1:8023",
      "adminToken": "vps-admin-token-change-me"
    },
    "logSources": [
      "/host/log/nginx/access.log"
    ]
  },
  {
    "id": "dropshipbd",
    "name": "DropshipBD",
    "publicUrl": "http://169.58.90.13:8024",
    "healthUrl": "http://127.0.0.1:8025/api/v1/health",
    "gatekeeper": {
      "baseUrl": "http://127.0.0.1:8024",
      "adminToken": "vps-admin-token-change-me"
    },
    "logSources": [
      "/host/log/dropship/access.log"
    ]
  },
  {
    "id": "ai-invoice",
    "name": "AI Invoice PO Matching",
    "publicUrl": "http://169.58.90.13:5174",
    "healthUrl": "http://127.0.0.1:8080/up",
    "gatekeeper": {
      "baseUrl": "http://127.0.0.1:5174",
      "adminToken": "vps-admin-token-change-me"
    },
    "logSources": []
  },
  {
    "id": "studio-web",
    "name": "Studio (company profile)",
    "publicUrl": "http://169.58.90.13:8027",
    "healthUrl": "http://127.0.0.1:8028/api/health",
    "gatekeeper": {
      "baseUrl": "http://127.0.0.1:8027",
      "adminToken": "vps-admin-token-change-me"
    },
    "logSources": [
      "/host/github/studio-web/deploy/logs/access.log"
    ]
  }
]
```

A project's `healthUrl` must point at the service's **internal (loopback) port**, not its
public gatekeeper port. The public port belongs to the gatekeeper, which keeps answering
there while the stack is asleep — it returns its warming page with HTTP 200 — so polling it
would make the dashboard report `awake` for a sleeping project. For example, `studio-web`
is served publicly on the gatekeeper port `:8027` but its health is probed on the
loopback-only internal port `:8028/api/health`, the same split `gazi-portfolio` uses
(`:8023` public / `:8026` health). This works because the dashboard container runs with
`network_mode: host`, so `127.0.0.1` is the host itself.

### Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique slug; used as DB key and route param |
| `name` | string | yes | Display name |
| `publicUrl` | string (URL) | yes | Public URL shown in the UI |
| `healthUrl` | string (URL) | yes | Polled to determine awake/asleep status (200 = awake) |
| `gatekeeper` | object | no | Presence enables Deploy/Teardown controls |
| `gatekeeper.baseUrl` | string (URL) | yes* | Base URL of the gatekeeper (usually the public URL) |
| `gatekeeper.adminToken` | string | yes* | Sent as `X-Admin-Token` / `?token=` |
| `logSources` | string[] | no | Absolute paths (inside container, e.g. `/host/log/...`) to access logs to tail (CLF/combined; append `$http_x_forwarded_for` to capture real visitor IPs) |

\* required when `gatekeeper` is present.

### Status semantics

- `awake` — `healthUrl` returns HTTP 200.
- `asleep` — `healthUrl` non-200 or connection refused while a gatekeeper exists.
- `unknown` — no health URL response and no gatekeeper (or error).
- Gatekeeper state: `GET {baseUrl}/_ondemand/status` → `{ state, message, lastActivity,
  idleTimeoutMs, ... }`. For projects without a gatekeeper, reported as `n/a (always-on)`.

## Adding a project

1. Append an entry to `config/projects.json`.
2. Ensure `healthUrl` is reachable from the dashboard container (use `127.0.0.1` for
   host-local services).
3. For gatekeeper-controlled projects, set `gatekeeper.baseUrl` and `adminToken`.
4. Add any access-log paths to `logSources` (paths must be visible under a host mount, e.g.
   `/host/log/...`).
5. Redeploy (or restart) — config is read at startup and on each poll.

## Admin token

The gatekeeper admin token is shared across instances in the current VPS setup
(`vps-admin-token-change-me`). For a new gatekeeper instance, set `ADMIN_TOKEN` in that
instance's `.env` and mirror it in `config/projects.json`.

## Redeploy

No new environment variables are required — the dashboard proxies redeploy through
`POST /api/projects/:id/redeploy` → gatekeeper `POST /_ondemand/redeploy` using the
existing admin token. Redeploy tears down then deploys and streams progress over SSE.
