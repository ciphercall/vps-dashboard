import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Visit, LogState } from '../types.js';

let _db: Database.Database | null = null;

function dbPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), 'dashboard.db');
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const p = dbPath();
  const dir = path.dirname(p);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  _db = new Database(p);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      ip TEXT NOT NULL,
      country_code TEXT,
      country_name TEXT,
      path TEXT,
      user_agent TEXT,
      status INTEGER,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visits_project_ts ON visits(project_id, ts DESC);

    CREATE TABLE IF NOT EXISTS log_state (
      path TEXT PRIMARY KEY,
      inode INTEGER,
      offset INTEGER NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export interface VisitInput {
  project_id: string;
  ip: string;
  country_code?: string | null;
  country_name?: string | null;
  path?: string | null;
  user_agent?: string | null;
  status?: number | null;
  ts: number;
}

export function insertVisit(v: VisitInput): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO visits (project_id, ip, country_code, country_name, path, user_agent, status, ts)
     VALUES (@project_id, @ip, @country_code, @country_name, @path, @user_agent, @status, @ts)`
  ).run({
    project_id: v.project_id,
    ip: v.ip,
    country_code: v.country_code ?? null,
    country_name: v.country_name ?? null,
    path: v.path ?? null,
    user_agent: v.user_agent ?? null,
    status: v.status ?? null,
    ts: v.ts,
  });
}

export function insertVisits(visits: VisitInput[]): void {
  if (!visits.length) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO visits (project_id, ip, country_code, country_name, path, user_agent, status, ts)
     VALUES (@project_id, @ip, @country_code, @country_name, @path, @user_agent, @status, @ts)`
  );
  const tx = db.transaction((rows: VisitInput[]) => {
    for (const v of rows) {
      stmt.run({
        project_id: v.project_id,
        ip: v.ip,
        country_code: v.country_code ?? null,
        country_name: v.country_name ?? null,
        path: v.path ?? null,
        user_agent: v.user_agent ?? null,
        status: v.status ?? null,
        ts: v.ts,
      });
    }
  });
  tx(visits);
}

export interface VisitQueryOptions {
  limit?: number;
  offset?: number;
  since?: number;
}

export function getVisits(
  projectId: string,
  opts: VisitQueryOptions = {}
): Visit[] {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT id, project_id, ip, country_code, country_name, path, user_agent, status, ts
       FROM visits WHERE project_id = ? ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(projectId, limit, offset) as any[];
  return rows.map(rowToVisit);
}

export function getVisitCount(projectId: string, since?: number): number {
  const db = getDb();
  if (since) {
    const r = db
      .prepare('SELECT COUNT(*) AS c FROM visits WHERE project_id = ? AND ts >= ?')
      .get(projectId, since) as any;
    return r?.c ?? 0;
  }
  const r = db
    .prepare('SELECT COUNT(*) AS c FROM visits WHERE project_id = ?')
    .get(projectId) as any;
  return r?.c ?? 0;
}

export function getVisitSummary(projectId: string): {
  total: number;
  today: number;
  last7d: number;
  topCountries: { code: string | null; name: string | null; count: number }[];
} {
  const db = getDb();
  const now = Date.now();
  const dayStart = now - 24 * 60 * 60 * 1000;
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const total = getVisitCount(projectId);
  const today = getVisitCount(projectId, dayStart);
  const last7d = getVisitCount(projectId, weekStart);
  const topRows = db
    .prepare(
      `SELECT country_code AS code, country_name AS name, COUNT(*) AS count
       FROM visits WHERE project_id = ? GROUP BY country_code, country_name
       ORDER BY count DESC LIMIT 10`
    )
    .all(projectId) as any[];
  return {
    total,
    today,
    last7d,
    topCountries: topRows.map((r) => ({
      code: r.code ?? null,
      name: r.name ?? null,
      count: r.count,
    })),
  };
}

export function getLogState(p: string): LogState | null {
  const db = getDb();
  const row = db
    .prepare('SELECT path, inode, offset, size, updated_at FROM log_state WHERE path = ?')
    .get(p) as any;
  if (!row) return null;
  return {
    path: row.path,
    inode: row.inode ?? null,
    offset: row.offset ?? 0,
    size: row.size ?? 0,
    updated_at: row.updated_at ?? 0,
  };
}

export function setLogState(p: string, inode: number | null, offset: number, size: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO log_state (path, inode, offset, size, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET inode=excluded.inode, offset=excluded.offset, size=excluded.size, updated_at=excluded.updated_at`
  ).run(p, inode, offset, size, Date.now());
}

export function resetLogState(p: string): void {
  const db = getDb();
  db.prepare('DELETE FROM log_state WHERE path = ?').run(p);
}

export function getAllLogStates(): LogState[] {
  const db = getDb();
  const rows = db.prepare('SELECT path, inode, offset, size, updated_at FROM log_state').all() as any[];
  return rows.map((r) => ({
    path: r.path,
    inode: r.inode ?? null,
    offset: r.offset ?? 0,
    size: r.size ?? 0,
    updated_at: r.updated_at ?? 0,
  }));
}

function rowToVisit(r: any): Visit {
  return {
    id: r.id,
    project_id: r.project_id,
    ip: r.ip,
    country_code: r.country_code ?? null,
    country_name: r.country_name ?? null,
    path: r.path ?? null,
    user_agent: r.user_agent ?? null,
    status: r.status ?? null,
    ts: r.ts,
  };
}

// Re-export db for consumers that want raw access.
export { Database };

// Eager instance (convenience) + aliases.
export const db = getDb();
export const database = db;
export const getDatabase = getDb;
export default {
  getDb,
  db,
  database,
  insertVisit,
  insertVisits,
  getVisits,
  getVisitCount,
  getVisitSummary,
  getLogState,
  setLogState,
  resetLogState,
  getAllLogStates,
  Database,
};