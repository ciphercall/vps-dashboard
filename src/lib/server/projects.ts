import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../types.js';

function configPath(): string {
  return process.env.PROJECTS_CONFIG || path.join(process.cwd(), 'config', 'projects.json');
}

let cached: { data: Project[]; mtime: number } | null = null;

export function loadProjects(force = false): Project[] {
  const p = configPath();
  let mtime = 0;
  try {
    mtime = fs.statSync(p).mtimeMs;
  } catch {
    return [];
  }
  if (!force && cached && cached.mtime === mtime) return cached.data;
  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.projects) ? raw.projects : [];
  const projects: Project[] = list.map((e: any) => ({
    id: String(e.id),
    name: String(e.name ?? e.id),
    publicUrl: String(e.publicUrl ?? e.public_url ?? ''),
    healthUrl: String(e.healthUrl ?? e.health_url ?? ''),
    gatekeeper: e.gatekeeper
      ? {
          baseUrl: String(e.gatekeeper.baseUrl ?? e.gatekeeper.base_url ?? ''),
          adminToken: e.gatekeeper.adminToken ?? e.gatekeeper.admin_token,
        }
      : undefined,
    logSources: Array.isArray(e.logSources ?? e.log_sources)
      ? (e.logSources ?? e.log_sources).map((x: any) => String(x))
      : [],
  }));
  cached = { data: projects, mtime };
  return projects;
}

export function getProject(id: string): Project | undefined {
  return loadProjects().find((p) => p.id === id);
}

export function configFilePath(): string {
  return configPath();
}

// Aliases / compatibility exports.
export const getProjects = loadProjects;
export function getProjectById(id: string): Project | undefined {
  return getProject(id);
}
export default { loadProjects, getProjects, getProject, getProjectById, configFilePath };