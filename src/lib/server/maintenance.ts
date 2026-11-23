import { countVisitsBefore, pruneVisits, getVisitStats, vacuumVisits } from './db.js';

/**
 * Nightly housekeeping for the SQLite visits DB.
 *
 * The dashboard runs always-on and its DB is on the same 100 GB disk as the
 * docker estate, so an insert-only visits table only ever grows. Retention is
 * opt-in: VISITS_RETENTION_DAYS defaults to 0, which counts what *would* be
 * pruned and logs it without deleting a row. Set a positive number to enable.
 *
 * Env:
 *   VISITS_RETENTION_DAYS  0 = dry run (default), N > 0 = keep N days
 *   MAINTENANCE_INTERVAL_MS  default 24 h
 */

const DAY_MS = 24 * 60 * 60 * 1000;

let started = false;
let lastVacuumMs = 0;

function retentionDays(): number {
  const raw = process.env.VISITS_RETENTION_DAYS;
  const n = raw === undefined || raw === '' ? 0 : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function runVisitsMaintenanceOnce(): void {
  const days = retentionDays();
  const stats = getVisitStats();

  if (stats.total === 0) {
    return;
  }

  if (days === 0) {
    // Dry run: report the window that WOULD be trimmed if the default were e.g. 90.
    const probeDays = 90;
    const would = countVisitsBefore(Date.now() - probeDays * DAY_MS);
    console.log(
      `[maintenance] visits=${stats.total} retention=off (dry run): ` +
        `${would} row(s) would be pruned at ${probeDays} days`
    );
    return;
  }

  const cutoff = Date.now() - days * DAY_MS;
  const removed = pruneVisits(cutoff);
  if (removed === 0) {
    console.log(`[maintenance] visits=${stats.total} retention=${days}d: nothing to prune`);
    return;
  }

  if (vacuumVisits(lastVacuumMs)) {
    lastVacuumMs = Date.now();
    console.log(`[maintenance] visits: pruned ${removed} row(s) older than ${days}d, VACUUM done`);
  } else {
    console.log(`[maintenance] visits: pruned ${removed} row(s) older than ${days}d`);
  }
}

/** Start the singleton scheduler. Safe to call from every request (see hooks.server.ts). */
export function startMaintenanceScheduler(intervalMs = 24 * 60 * 60 * 1000): void {
  if (started) return;
  started = true;

  const tick = () => {
    try {
      runVisitsMaintenanceOnce();
    } catch (err) {
      console.error('[maintenance] failed:', (err as Error)?.message ?? err);
    }
  };

  // Run shortly after boot, then on the interval. A setTimeout rather than an
  // immediate call keeps the first request from paying for it.
  setTimeout(tick, 60_000);
  setInterval(tick, Math.max(intervalMs, 60_000));
}
