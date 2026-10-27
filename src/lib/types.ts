// Shared types for the VPS operations dashboard.

export type ProjectStatus = 'awake' | 'asleep' | 'unknown';

export interface GatekeeperConfig {
  baseUrl: string;
  adminToken?: string;
}

export interface Project {
  id: string;
  name: string;
  publicUrl: string;
  healthUrl: string;
  gatekeeper?: GatekeeperConfig;
  logSources?: string[];
}

export interface GatekeeperStatus {
  state: string;
  message?: string;
  target?: string;
  deployStartedAt?: number | null;
  readyAt?: number | null;
  lastActivity?: number | null;
  estimatedDeploySeconds?: number;
  idleTimeoutMs?: number;
  internalPort?: number;
  publicPort?: number;
}

export interface ProjectWithStatus extends Project {
  status: ProjectStatus;
  gatekeeperState: string;
  gatekeeperStatus?: GatekeeperStatus | null;
}

export interface Visit {
  id?: number;
  project_id: string;
  ip: string;
  country_code?: string | null;
  country_name?: string | null;
  path?: string | null;
  user_agent?: string | null;
  status?: number | null;
  ts: number;
}

export interface VisitSummary {
  total: number;
  today: number;
  last7d: number;
  topCountries: { code: string | null; name: string | null; count: number }[];
}

export interface CpuMetrics {
  load: number;
  cores: number;
  usage: number;
  perCore: number[];
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  available: number;
  percent: number;
}

export interface DiskMetrics {
  fs: string;
  type?: string;
  size: number;
  used: number;
  available: number;
  use: number;
  mount: string;
}

export interface Metrics {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics[];
  uptime: number;
  timestamp: number;
}

export interface VpsInfo {
  hostname: string;
  ip: string;
  os: string;
  cpuCores: number;
  ramBytes: number;
  disk: string;
  region?: string;
  provider?: string;
  dockerVersion?: string;
  containerCount?: number;
  uptime: number;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  state: string;
}

export interface LogState {
  path: string;
  inode: number | null;
  offset: number;
  size: number;
  updated_at: number;
}