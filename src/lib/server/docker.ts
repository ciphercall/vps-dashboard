import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ContainerInfo } from '../types.js';

const execFileAsync = promisify(execFile);

async function run(args: string[], timeout = 10000): Promise<string> {
  try {
    const { stdout } = await execFileAsync('docker', args, { timeout });
    return stdout;
  } catch (err: any) {
    // Some docker commands write to stderr but still useful; prefer stderr on failure.
    if (err?.stdout) return err.stdout;
    throw err;
  }
}

export async function dockerVersion(): Promise<string> {
  try {
    const out = await run(['version', '--format', '{{.Server.Version}}'], 5000);
    const v = out.trim();
    if (v) return v;
  } catch {
    /* fall through */
  }
  try {
    const out = await run(['--version'], 5000);
    return out.trim();
  } catch {
    return 'unavailable';
  }
}

export async function listContainers(all = true): Promise<ContainerInfo[]> {
  const args = ['ps', '--format', '{{json .}}'];
  if (all) args.splice(1, 0, '-a');
  // Actually docker ps -a --format
  const finalArgs = all ? ['ps', '-a', '--format', '{{json .}}'] : ['ps', '--format', '{{json .}}'];
  let out = '';
  try {
    out = await run(finalArgs, 10000);
  } catch {
    return [];
  }
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const result: ContainerInfo[] = [];
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      result.push({
        id: j.ID || j.Id || '',
        name: j.Names || j.Name || '',
        image: j.Image || '',
        status: j.Status || '',
        ports: j.Ports || '',
        state: j.State || '',
      });
    } catch {
      /* skip unparseable */
    }
  }
  return result;
}

export async function containerCount(runningOnly = true): Promise<number> {
  const containers = await listContainers(!runningOnly);
  if (runningOnly) {
    return containers.filter((c) => /up|running/i.test(c.status) || c.state === 'running').length;
  }
  return containers.length;
}

export async function runningContainerCount(): Promise<number> {
  try {
    const out = await run(['ps', '-q'], 5000);
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

export interface ContainerStats {
  name: string;
  cpu: string;
  mem: string;
  memPercent: string;
}

export async function stats(): Promise<ContainerStats[]> {
  try {
    const out = await run(['stats', '--no-stream', '--format', '{{json .}}'], 15000);
    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines
      .map((l) => {
        try {
          const j = JSON.parse(l);
          return {
            name: j.Name || '',
            cpu: j.CPUPerc || '',
            mem: j.MemUsage || '',
            memPercent: j.MemPerc || '',
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as ContainerStats[];
  } catch {
    return [];
  }
}

export async function inspect(nameOrId: string): Promise<any> {
  try {
    const out = await run(['inspect', nameOrId], 10000);
    const arr = JSON.parse(out);
    return Array.isArray(arr) ? arr[0] : arr;
  } catch {
    return null;
  }
}

export const getContainerCount = runningContainerCount;
export const getDockerVersion = dockerVersion;
export default { dockerVersion, getDockerVersion, listContainers, containerCount, runningContainerCount, getContainerCount, stats, inspect };