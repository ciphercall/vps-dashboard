# Visitor Tracking

## Overview

Visitors are aggregated from each monitored project's web-server / container access logs
mounted from the host. No project code changes are required. Country is resolved offline via
`geoip-lite`. An optional `POST /api/track` beacon is available for projects that opt in.

## SQLite schema

```sql
CREATE TABLE visits (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  country_code TEXT,
  country_name TEXT,
  path TEXT,
  user_agent TEXT,
  status INTEGER,
  ts INTEGER NOT NULL
);
CREATE INDEX idx_visits_project_ts ON visits(project_id, ts DESC);

CREATE TABLE log_state (
  path TEXT PRIMARY KEY,
  inode INTEGER,
  offset INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Log sources

Configured per project in `config/projects.json` → `logSources` (array of absolute paths
inside the container, e.g. `/host/log/nginx/access.log`). The host mount `/var/log:/host/log:ro`
makes host logs visible.

## Supported formats

Common Log Format (CLF) and Combined Log Format:

```
127.0.0.1 - - [10/Oct/2024:13:55:36 +0000] "GET /path HTTP/1.1" 200 2326 "-" "Mozilla/5.0 ..."
```

Parsed fields: IP, timestamp, request (method + path + protocol), status code, user agent.
Malformed lines are skipped (counted, not fatal).

## Ingestion cadence

- Tailer runs every **30 seconds** (singleton started in `hooks.server.ts`).
- For each `logSources` path: read bytes appended since last offset, parse, geo-lookup,
  insert.
- Byte offset persisted in `log_state` so restarts do not re-ingest.

## Log rotation handling

On each tick the tailer `stat`s the file:
- If size shrank or inode changed → reset offset to 0 and re-read from start.
- Otherwise read `[offset, size)`.

## Geo lookup

`geoip-lite` (offline DB, ~60 MB) resolves `country_code` and `country_name`. Accuracy is
IP-geolocation grade. Unknown IPs yield null country (flag omitted in UI).

## UI

Project row expands → nested paginated table:

| Column | Source |
|---|---|
| Timestamp | `ts` |
| IP | `ip` |
| Flag | `country_code` |
| Country | `country_name` |
| Path | `path` |
| User agent | `user_agent` (truncated) |

Plus summary: visits today, visits last 7 days, top countries.

## Optional beacon (`POST /api/track`)

For projects that opt in, send a beacon:

```js
fetch('http://169.58.90.13:8030/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 'gazi-portfolio',
    path: location.pathname,
    // ip is taken from request headers (X-Forwarded-For / socket)
  })
});
```

The endpoint inserts a visit row with the caller's IP and resolved country. Use sparingly —
log tailing is the primary source.

## Empty state

If a project shows "no visits yet":
1. Confirm `logSources` paths exist inside the container: `ls -la /host/log/...`.
2. Confirm the log format is CLF/combined; custom formats need a parser change.
3. Trigger traffic to the project, wait 30 s, refresh.
4. Check dashboard logs: `docker logs vps-dashboard`.
5. Try the beacon endpoint for a quick smoke test.

## Retention

All rows are kept in v1. Pruning can be added later if storage grows.
