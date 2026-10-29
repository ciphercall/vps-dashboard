# Architecture

## Data flow

```
Browser ──► dashboard (Node, :8030, host network)
            ├─ GET  /api/metrics        → systeminformation (host via HOST_PROC/HOST_SYS/HOST_FS)
            ├─ GET  /api/vps             → /etc/os-release, hostname, ip, uptime, docker version
            ├─ GET  /api/projects        → config/projects.json + live status + gatekeeper state
            ├─ POST /api/projects/:id/deploy    → POST gatekeeper /_ondemand/deploy (admin token)
            ├─ POST /api/projects/:id/teardown  → POST gatekeeper /_ondemand/teardown
            ├─ GET  /api/projects/:id/visits    → SQLite (paginated)
            ├─ GET  /api/projects/:id/visits/summary
            ├─ POST /api/track           → optional beacon insert
            ├─ POST /api/auth/login | GET /api/auth/logout
            └─ background: log tailer (every 30s) ingests new lines → SQLite visits
```

Gatekeeper control is purely HTTP to existing endpoints; nothing in `on-demand-gatekeeper`
is edited.

## Modules (`src/lib/server/`)

| Module | Responsibility |
|---|---|
| `auth.ts` | Sign/verify `dashboard_session` cookie from `SESSION_SECRET` |
| `db.ts` | `better-sqlite3` schema (`visits`, `log_state`) + queries |
| `metrics.ts` | `systeminformation` wrappers with host env + 5s cache |
| `docker.ts` | `docker ps` / stats via `child_process` |
| `gatekeeper.ts` | Status / deploy / teardown HTTP client |
| `ingest.ts` | Log tailer + `geoip-lite` country lookup |
| `projects.ts` | Load + validate `config/projects.json` |

## Frontend (`src/lib/components/`)

- `Gauge.svelte` — animated SVG arc gauge (CSS `stroke-dashoffset` transitions, color thresholds)
- `ProjectRow.svelte` — expandable row + nested visits table
- `StatusBadge.svelte` — awake / asleep / unknown / n/a badge
- `CountryFlag.svelte` — flag from `country-flag-icons`

## Host mounts (container)

The dashboard container runs with `network_mode: host` and read-only host mounts so a
containerised process can observe the host:

| Container path | Host source | Purpose |
|---|---|---|
| `/host/proc` | `/proc` | CPU, memory, process info |
| `/host/sys` | `/sys` | System info |
| `/host/root` | `/` | Disk (`fsSize`), `/etc/os-release` |
| `/var/run/docker.sock` | host socket | Container count / docker version |
| `/host/log` | `/var/log` | Access logs for visitor ingestion |
| `/host/github` | `/opt/github` | Project repos / compose files (read-only) |
| `/data` (volume) | named volume | SQLite DB persistence |

## Auth flow

1. `/login` form POSTs to `/api/auth/login`.
2. On success a signed `dashboard_session` cookie is set (httpOnly, secure in prod).
3. `hooks.server.ts` checks the cookie on every route except `/login` and `/api/auth/login`;
   invalid → redirect to `/login`.
4. `/logout` clears the cookie.

## Metrics caching

`metrics.ts` samples every 5 s and keeps the last sample in memory; API requests return the
cached sample and trigger a background refresh. This keeps API p95 under 100 ms.

Memory is reported as **active** memory (`total − available`), not cache-inclusive `used`.
On Linux `used = total − free` includes OS page cache/buffers, which the kernel keeps after
containers stop, so reporting it inflated the gauge (e.g. 95% while `available` was ~10 GB).
`used`/`percent` therefore reflect real pressure; `available` and `free` are still exposed for
diagnostics. CPU and disk are unchanged.

## Visitor ingestion

A singleton tailer started in `hooks.server.ts` runs every 30 s. For each configured
`logSources` entry it reads appended bytes from the last byte offset (stored in `log_state`),
parses common/combined log lines, resolves the country via `geoip-lite`, and inserts rows.
Log rotation is detected by inode / size shrink and resets the offset. See
[`VISITOR_TRACKING.md`](VISITOR_TRACKING.md).

## Gatekeeper integration

`gatekeeper.ts` calls (with `X-Admin-Token` or `?token=`):

- `GET  {baseUrl}/_ondemand/status` → `{ state, message, lastActivity, idleTimeoutMs, ... }`
- `POST {baseUrl}/_ondemand/deploy`
- `POST {baseUrl}/_ondemand/teardown`

For projects without a gatekeeper (e.g. DropshipBD) the state is reported as
`n/a (always-on)`.
