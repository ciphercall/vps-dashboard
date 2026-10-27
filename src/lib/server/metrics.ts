import si from 'systeminformation';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Metrics, VpsInfo, DiskMetrics, CpuMetrics, MemoryMetrics } from '../types.js';

const execFileAsync = promisify(execFile);

// Ensure host mounts are honoured even if not already in env.
if (!process.env.HOST_PROC) process.env.HOST_PROC = '/host/proc';
if (!process.env.HOST_SYS) process.env.HOST_SYS = '/host/sys';
if (!process.env.HOST_FS) process.env.HOST_FS = '/host/root';

let cache: { data: Metrics; ts: number } | null = null;
let refreshing = false;

async function collectMetrics(): Promise<Metrics> {
  let cpuLoad = 0;
  let perCore: number[] = [];
  let cores = os.cpus().length || 1;
  try {
    const load = await si.currentLoad();
    cpuLoad = load.currentLoad ?? 0;
    perCore = (load.cpus || []).map((c: any) => c.load ?? 0);
    if (load.cpus?.length) cores = load.cpus.length;
  } catch {
    /* fall back */
  }
  try {
    const c = await si.cpu();
    if (c?.cores) cores = c.cores;
  } catch {
    /* ignore */
  }

  let memTotal = 0;
  let memUsed = 0;
  let memFree = 0;
  let memAvailable = 0;
  try {
    const m = await si.mem();
    memTotal = m.total ?? 0;
    memUsed = m.used ?? 0;
    memFree = m.free ?? 0;
    memAvailable = m.available ?? m.free ?? 0;
  } catch {
    const t = os.totalmem();
    const f = os.freemem();
    memTotal = t;
    memFree = f;
    memUsed = t - f;
    memAvailable = f;
  }

  let disks: DiskMetrics[] = [];
  try {
    const fsSize = await si.fsSize();
    disks = (fsSize || []).map((d: any) => ({
      fs: d.fs ?? '',
      type: d.type,
      size: d.size ?? 0,
      used: d.used ?? 0,
      available: d.available ?? 0,
      use: d.use ?? (d.size ? (d.used / d.size) * 100 : 0),
      mount: d.mount ?? '',
    }));
  } catch {
    /* ignore */
  }

  let uptime = os.uptime();
  try {
    const t = await si.time();
    if (typeof t?.uptime === 'number') uptime = t.uptime;
  } catch {
    /* ignore */
  }

  const memory: MemoryMetrics = {
    total: memTotal,
    used: memUsed,
    free: memFree,
    available: memAvailable,
    percent: memTotal ? (memUsed / memTotal) * 100 : 0,
  };

  const cpu: CpuMetrics = {
    load: cpuLoad,
    cores,
    usage: cpuLoad,
    perCore,
  };

  return {
    cpu,
    memory,
    disk: disks,
    uptime,
    timestamp: Date.now(),
  };
}

export async function getMetrics(): Promise<Metrics> {
  const now = Date.now();
  if (cache && now - cache.ts < 5000) return cache.data;
  if (refreshing && cache) return cache.data;
  refreshing = true;
  try {
    const data = await collectMetrics();
    cache = { data, ts: Date.now() };
    return data;
  } finally {
    refreshing = false;
  }
}

export function getCachedMetrics(): Metrics | null {
  return cache?.data ?? null;
}

async function dockerVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: 5000,
    });
    return stdout.trim() || 'unknown';
  } catch {
    try {
      const { stdout } = await execFileAsync('docker', ['--version'], { timeout: 5000 });
      return stdout.trim();
    } catch {
      return 'unavailable';
    }
  }
}

async function containerCount(): Promise<number> {
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '-q'], { timeout: 5000 });
    return stdout.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

export async function getVpsInfo(): Promise<VpsInfo> {
  const ip = process.env.VPS_IP || '169.58.90.13';
  let hostname = os.hostname();
  let osName = `${os.type()} ${os.release()}`;
  let cpuCores = os.cpus().length || 1;
  let ramBytes = os.totalmem();
  try {
    const o = await si.osInfo();
    if (o?.hostname) hostname = o.hostname;
    if (o?.distro) osName = `${o.distro}${o.release ? ' ' + o.release : ''}`.trim();
  } catch {
    /* ignore */
  }
  try {
    const c = await si.cpu();
    if (c?.cores) cpuCores = c.cores;
  } catch {
    /* ignore */
  }
  try {
    const m = await si.mem();
    if (m?.total) ramBytes = m.total;
  } catch {
    /* ignore */
  }

  let uptime = os.uptime();
  try {
    const t = await si.time();
    if (typeof t?.uptime === 'number') uptime = t.uptime;
  } catch {
    /* ignore */
  }

  const dv = await dockerVersion();
  const cc = await containerCount();

  return {
    hostname,
    ip,
    os: osName,
    cpuCores,
    ramBytes,
    disk: process.env.VPS_DISK || '200 GB SSD',
    region: process.env.VPS_REGION,
    provider: process.env.VPS_PROVIDER || 'Contabo',
    dockerVersion: dv,
    containerCount: cc,
    uptime,
  };
}

// Re-export si for advanced callers.
export { si };

// Aliases / compatibility exports.
export const getSystemMetrics = getMetrics;
export const getCachedMetricsAlias = getCachedMetrics;
export default { getMetrics, getSystemMetrics, getCachedMetrics, getVpsInfo, si };