import { isPrivateIp, firstForwardedIp } from '../ip.js';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, insertVisits, getLogState, setLogState } from './db.js';
import { loadProjects } from './projects.js';
import type { Project } from '../types.js';

// geoip-lite is CommonJS; load lazily to avoid hard import failures.
let geoip: any = null;
function getGeoip(): any {
  return geoip;
}

// Attempt ESM import at module load (non-blocking-ish but await not possible here).
let geoipPromise: Promise<any> | null = null;
try {
  // Use Function to avoid compile-time module resolution for untyped module.
  geoipPromise = (new Function('return import("geoip-lite")'))() as Promise<any>;
  geoipPromise = geoipPromise
    .then((m: any) => {
      geoip = m?.default ?? m;
      return geoip;
    })
    .catch(() => null);
} catch {
  geoipPromise = null;
}

async function ensureGeoip(): Promise<any> {
  if (geoip) return geoip;
  if (geoipPromise) {
    try {
      const m = await geoipPromise;
      if (m) geoip = m;
    } catch {
      /* ignore */
    }
  }
  if (!geoip) {
    try {
      const m = await (new Function('return import("geoip-lite")'))();
      geoip = (m as any)?.default ?? m;
    } catch {
      geoip = null;
    }
  }
  return geoip;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseLogDate(s: string): number {
  // 10/Oct/2000:13:55:36 -0700
  const m = s.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/);
  if (!m) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? Date.now() : t;
  }
  const [, dd, mon, yyyy, hh, mm, ss, tz] = m;
  const month = MONTHS[mon];
  if (month === undefined) return Date.now();
  // Build an ISO-ish string with tz offset.
  const offsetSign = tz[0];
  const offsetH = tz.slice(1, 3);
  const offsetM = tz.slice(3, 5);
  const iso = `${yyyy}-${String(month + 1).padStart(2, '0')}-${dd}T${hh}:${mm}:${ss}${offsetSign}${offsetH}:${offsetM}`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Date.now() : t;
}

// Common/combined log format parser.
const LOG_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?(?:\s+"([^"]*)")?/;

interface ParsedLine {
  ip: string;
  ts: number;
  method: string;
  path: string;
  status: number;
  userAgent: string | null;
}

function parseLine(line: string): ParsedLine | null {
  const m = line.match(LOG_RE);
  if (!m) return null;
  let ip = m[1];
  const ts = parseLogDate(m[2]);
  const request = m[3];
  const status = parseInt(m[4], 10);
  const ua = m[7] ?? null;
  const xff = m[8] ?? null;
  if (isPrivateIp(ip) && xff && xff !== '-') { const real = firstForwardedIp(xff); if (real) ip = real; }
  let method = '';
  let p = request;
  const parts = request.split(' ');
  if (parts.length >= 2) {
    method = parts[0];
    p = parts[1];
  }
  return {
    ip,
    ts,
    method,
    path: p || request,
    status: Number.isNaN(status) ? 0 : status,
    userAgent: ua,
  };
}

// Docker json-file log envelope parser. Docker writes each line as
// {"log":"...","stream":"stdout","time":"..."} where the inner "log" is the
// container's own stdout (here nginx access lines in a custom format).
function unwrapDockerLog(line: string): { inner: string; ts: number | null } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj?.log !== 'string') return null;
    const ts = typeof obj.time === 'string' ? Date.parse(obj.time) : NaN;
    return { inner: String(obj.log).replace(/\r?\n$/, ''), ts: Number.isNaN(ts) ? null : ts };
  } catch {
    return null;
  }
}

// Parse the gazi-portfolio nginx custom access format:
//   <ip> - <status> "METHOD PATH HTTP/x" ...
function parseDockerInner(inner: string): ParsedLine | null {
  // Try standard combined/common first (some containers log that).
  const std = parseLine(inner);
  if (std) return std;
  const m = inner.match(/^(\S+)\s+-\s+(\d{3})\s+"(\S+)\s+(\S+)(?:\s+[^"]*)?"/);
  if (!m) return null;
  const ip = m[1];
  const status = parseInt(m[2], 10);
  const method = m[3];
  const p = m[4];
  return {
    ip,
    ts: Date.now(),
    method,
    path: p || '/',
    status: Number.isNaN(status) ? 0 : status,
    userAgent: null,
  };
}
function countryInfo(code: string | null): { code: string | null; name: string | null } {
  if (!code) return { code: null, name: null };
  let name: string | null = null;
  try {
    const dn = new (Intl as any).DisplayNames(['en'], { type: 'region' });
    name = dn.of(code) || null;
  } catch {
    name = null;
  }
  return { code, name };
}

function lookupCountry(ip: string): { code: string | null; name: string | null } {
  const g = getGeoip();
  if (!g) return { code: null, name: null };
  try {
    const r = g.lookup ? g.lookup(ip) : null;
    if (r?.country) {
      return countryInfo(r.country);
    }
  } catch {
    /* ignore */
  }
  return { code: null, name: null };
}

function getInode(filePath: string): number | null {
  try {
    return fs.statSync(filePath).ino ?? null;
  } catch {
    return null;
  }
}

/**
 * Tail a single log file for a project, ingest new lines.
 */
export async function tailLog(projectId: string, filePath: string): Promise<number> {
  await ensureGeoip();
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return 0;
  }
  const inode = stat.ino ?? null;
  const size = stat.size;
  const state = getLogState(filePath);

  let offset = 0;
  if (state) {
    // Rotation / truncation detection.
    if (state.inode !== null && inode !== null && state.inode !== inode) {
      offset = 0;
    } else if (size < state.offset) {
      offset = 0;
    } else {
      offset = state.offset;
    }
  }

  if (size <= offset) {
    // Nothing new; still update state.
    setLogState(filePath, inode, offset, size);
    return 0;
  }

  const toRead = size - offset;
  const buf = Buffer.alloc(toRead);
  let fd: number | null = null;
  let bytesRead = 0;
  try {
    fd = fs.openSync(filePath, 'r');
    bytesRead = fs.readSync(fd, buf, 0, toRead, offset);
  } catch {
    if (fd !== null) try { fs.closeSync(fd); } catch { /* ignore */ }
    return 0;
  }
  if (fd !== null) try { fs.closeSync(fd); } catch { /* ignore */ }

  const chunk = buf.subarray(0, bytesRead).toString('utf8');
  // Split into complete lines; keep trailing partial for next tick.
  const lines = chunk.split('\n');
  // If chunk does not end with newline, last element is partial -> don't consume it.
  const endsWithNewline = chunk.endsWith('\n');
  const completeLines = endsWithNewline ? lines.filter((l) => l.length > 0) : lines.slice(0, -1);
  const consumed = endsWithNewline
    ? bytesRead
    : bytesRead - Buffer.byteLength(lines[lines.length - 1] || '', 'utf8');

  const visits: any[] = [];
  for (const raw of completeLines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    let parsed = parseLine(line);
    let tsOverride: number | null = null;
    if (!parsed) {
      const unwrapped = unwrapDockerLog(line);
      if (unwrapped) {
        parsed = parseDockerInner(unwrapped.inner);
        tsOverride = unwrapped.ts;
      }
    }
    if (!parsed) continue;
    if (tsOverride !== null) parsed.ts = tsOverride;
    const geo = lookupCountry(parsed.ip);
    visits.push({
      project_id: projectId,
      ip: parsed.ip,
      country_code: geo.code,
      country_name: geo.name,
      path: parsed.path,
      user_agent: parsed.userAgent,
      status: parsed.status,
      ts: parsed.ts,
    });
  }

  if (visits.length) {
    try {
      insertVisits(visits);
      // eslint-disable-next-line no-console
      console.log('[ingest] inserted', visits.length, 'visits from', filePath);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ingest] insert failed:', e);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[ingest] no visits parsed from', filePath, 'lines:', completeLines.length);
  }

  const newOffset = offset + Math.max(consumed, 0);
  setLogState(filePath, inode, newOffset, size);
  return visits.length;
}

export async function runIngestTick(projects?: Project[]): Promise<{ inserted: number }> {
  const list = projects ?? loadProjects();
  let inserted = 0;
  for (const project of list) {
    const sources = project.logSources ?? [];
    for (const src of sources) {
      try {
        const n = await tailLog(project.id, src);
        inserted += n;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[ingest] failed tailing ${src}:`, err);
      }
    }
  }
  return { inserted };
}

let scheduler: NodeJS.Timeout | null = null;

export function startIngestScheduler(intervalMs = 30000): void {
  if (scheduler) return;
  // Initial run.
  runIngestTick().catch(() => {});
  scheduler = setInterval(() => {
    runIngestTick().catch(() => {});
  }, intervalMs);
  if (scheduler.unref) scheduler.unref();
}

export function stopIngestScheduler(): void {
  if (scheduler) {
    clearInterval(scheduler);
    scheduler = null;
  }
}

// Aliases / compatibility exports.
export const startIngest = startIngestScheduler;
export const ingestTick = runIngestTick;
export const tailLogFile = tailLog;
export const recordBeacon = recordVisit;
export default {
  tailLog,
  tailLogFile,
  runIngestTick,
  ingestTick,
  startIngestScheduler,
  startIngest,
  stopIngestScheduler,
  recordVisit,
  recordBeacon,
  ensureGeoip,
};

export async function recordVisit(input: {
  project_id: string;
  ip: string;
  country_code?: string | null;
  country_name?: string | null;
  path?: string | null;
  user_agent?: string | null;
  status?: number | null;
  ts?: number;
}): Promise<void> {
  await ensureGeoip();
  let code = input.country_code ?? null;
  let name = input.country_name ?? null;
  if (!code) {
    const geo = lookupCountry(input.ip);
    code = geo.code;
    name = geo.name;
  }
  insertVisits([
    {
      project_id: input.project_id,
      ip: input.ip,
      country_code: code,
      country_name: name,
      path: input.path ?? null,
      user_agent: input.user_agent ?? null,
      status: input.status ?? null,
      ts: input.ts ?? Date.now(),
    },
  ]);
}

// Touch db to ensure schema ready at import time (best effort).
try {
  getDb();
} catch {
  /* ignore */
}