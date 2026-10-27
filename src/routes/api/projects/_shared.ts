import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface ProjectConfig {
	id: string;
	name: string;
	publicUrl?: string;
	healthUrl?: string;
	gatekeeper?: {
		baseUrl: string;
		adminToken?: string;
	};
	logSources?: string[];
	[key: string]: any;
}

export function loadProjects(): ProjectConfig[] {
	const p = process.env.PROJECTS_CONFIG || 'config/projects.json';
	const full = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
	try {
		const raw = fs.readFileSync(full, 'utf8');
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed;
		if (parsed && Array.isArray(parsed.projects)) return parsed.projects;
		return [];
	} catch {
		return [];
	}
}

export function findProject(id: string): ProjectConfig | undefined {
	return loadProjects().find((p) => p.id === id);
}

export async function checkHealth(url?: string): Promise<boolean> {
	if (!url) return false;
	try {
		const controller = new AbortController();
		const t = setTimeout(() => controller.abort(), 5000);
		const res = await fetch(url, { signal: controller.signal });
		clearTimeout(t);
		return res.status === 200;
	} catch {
		return false;
	}
}

export async function gatekeeperStatus(gk?: ProjectConfig['gatekeeper']): Promise<any> {
	if (!gk?.baseUrl) {
		return { state: 'n/a', message: 'always-on (no gatekeeper)' };
	}
	try {
		const res = await fetch(`${gk.baseUrl.replace(/\/$/, '')}/_ondemand/status`);
		if (!res.ok) throw new Error(`status ${res.status}`);
		return await res.json();
	} catch (err: any) {
		return { state: 'unknown', message: err?.message || 'unreachable' };
	}
}

export async function gatekeeperControl(
	gk: ProjectConfig['gatekeeper'] | undefined,
	action: 'deploy' | 'teardown'
): Promise<{ ok: boolean; status: number; data: any }> {
	if (!gk?.baseUrl) {
		throw new Error('no gatekeeper configured for this project');
	}
	const url = `${gk.baseUrl.replace(/\/$/, '')}/_ondemand/${action}`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (gk.adminToken) headers['X-Admin-Token'] = gk.adminToken;
	const res = await fetch(url, { method: 'POST', headers });
	let data: any = null;
	try {
		data = await res.json();
	} catch {
		data = { raw: await res.text().catch(() => '') };
	}
	return { ok: res.ok, status: res.status, data };
}

// ---- SQLite helpers ----
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (_db) return _db;
	const p = process.env.DB_PATH || 'data/dashboard.db';
	const full = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	const d = new Database(full);
	d.pragma('journal_mode = WAL');
	d.exec(`CREATE TABLE IF NOT EXISTS visits (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		project_id TEXT NOT NULL,
		ip TEXT NOT NULL,
		country_code TEXT,
		country_name TEXT,
		path TEXT,
		user_agent TEXT,
		status INTEGER,
		ts INTEGER NOT NULL
	)`);
	d.exec(`CREATE INDEX IF NOT EXISTS idx_visits_project_ts ON visits(project_id, ts DESC)`);
	d.exec(`CREATE TABLE IF NOT EXISTS log_state (
		path TEXT PRIMARY KEY,
		inode INTEGER,
		offset INTEGER,
		updated_at INTEGER
	)`);
	_db = d;
	return d;
}