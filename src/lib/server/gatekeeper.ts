import type { GatekeeperStatus } from '../types.js';

export interface GatekeeperClientOptions {
  baseUrl: string;
  adminToken?: string;
  timeoutMs?: number;
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function request(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  adminToken?: string,
  timeoutMs = 15000
): Promise<any> {
  const base = normalizeBase(baseUrl);
  const url = new URL(path, base + '/');
  if (adminToken) {
    url.searchParams.set('token', adminToken);
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(String(msg));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function getStatus(baseUrl: string, timeoutMs = 10000): Promise<GatekeeperStatus> {
  const data = await request(baseUrl, '/_ondemand/status', 'GET', undefined, timeoutMs);
  return (data ?? {}) as GatekeeperStatus;
}

export async function deploy(
  baseUrl: string,
  adminToken?: string,
  timeoutMs = 300000
): Promise<GatekeeperStatus> {
  const data = await request(baseUrl, '/_ondemand/deploy', 'POST', adminToken, timeoutMs);
  return (data ?? {}) as GatekeeperStatus;
}

export async function teardown(
  baseUrl: string,
  adminToken?: string,
  timeoutMs = 120000
): Promise<GatekeeperStatus> {
  const data = await request(baseUrl, '/_ondemand/teardown', 'POST', adminToken, timeoutMs);
  return (data ?? {}) as GatekeeperStatus;
}

export class GatekeeperClient {
  baseUrl: string;
  adminToken?: string;
  timeoutMs: number;

  constructor(opts: GatekeeperClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.adminToken = opts.adminToken;
    this.timeoutMs = opts.timeoutMs ?? 15000;
  }

  status(timeoutMs?: number): Promise<GatekeeperStatus> {
    return getStatus(this.baseUrl, timeoutMs ?? this.timeoutMs);
  }

  deploy(timeoutMs?: number): Promise<GatekeeperStatus> {
    return deploy(this.baseUrl, this.adminToken, timeoutMs ?? 300000);
  }

  teardown(timeoutMs?: number): Promise<GatekeeperStatus> {
    return teardown(this.baseUrl, this.adminToken, timeoutMs ?? 120000);
  }
}

export function createGatekeeperClient(opts: GatekeeperClientOptions): GatekeeperClient {
  return new GatekeeperClient(opts);
}

// Convenience: derive a human-readable state string for projects without a gatekeeper.
export function alwaysOnState(): string {
  return 'n/a (always-on)';
}

// Aliases / compatibility exports.
export const getGatekeeperStatus = getStatus;
export const deployGatekeeper = deploy;
export const teardownGatekeeper = teardown;
export default { getStatus, getGatekeeperStatus, deploy, deployGatekeeper, teardown, teardownGatekeeper, GatekeeperClient, createGatekeeperClient, alwaysOnState };