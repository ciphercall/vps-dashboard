import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import { getMetrics } from '$lib/server/metrics';
import { getVisitStats } from '$lib/server/db';

/**
 * Storage guardrails: how much room is left, what the janitor last reclaimed,
 * and how big the visits table has become.
 *
 * The janitor log is read through the container's existing `/:/host/root:ro`
 * mount (deploy/docker-compose.yml), so no new mount is needed. Everything here
 * is read-only - this endpoint never deletes anything.
 */

const JANITOR_LOG = '/host/root/var/log/docker-janitor.log';
// Below this, the page shows a red badge. The janitor acts at 8 GiB; this is the
// point where a human should look.
const HARD_FLOOR_BYTES = 12 * 1024 * 1024 * 1024;

function tailLines(path: string, n: number): string[] {
	try {
		const text = fs.readFileSync(path, 'utf8');
		const lines = text.trimEnd().split('\n');
		return lines.slice(-n);
	} catch {
		return [];
	}
}

function parseReclaimed(lines: string[]): { timestamp: string; reclaimedBytes: number } | null {
	// "=== docker-janitor done, reclaimed 1.2GiB ==="
	for (let i = lines.length - 1; i >= 0; i--) {
		const m = lines[i].match(/^(\S+).*docker-janitor done, reclaimed ([\d.]+)([KMG]?)i?B/i);
		if (!m) continue;
		const value = parseFloat(m[2]);
		const unit = (m[3] || '').toUpperCase();
		const mult = unit === 'K' ? 1024 : unit === 'M' ? 1024 ** 2 : unit === 'G' ? 1024 ** 3 : 1;
		return { timestamp: m[1], reclaimedBytes: Math.round(value * mult) };
	}
	return null;
}

export const GET: RequestHandler = async () => {
	try {
		const metrics = await getMetrics();
		// The root filesystem is the one whose free space matters here.
		const root = metrics.disk.find((d) => d.mount === '/') ?? metrics.disk[0];

		const logLines = tailLines(JANITOR_LOG, 40);
		const last = parseReclaimed(logLines);

		const visits = getVisitStats();

		return json({
			disk: root
				? {
						mount: root.mount,
						sizeBytes: root.size,
						usedBytes: root.used,
						availableBytes: root.available,
						usedPercent: root.use,
					}
				: null,
			hardFloorBytes: HARD_FLOOR_BYTES,
			belowFloor: root ? root.available < HARD_FLOOR_BYTES : null,
			janitor: {
				logPath: JANITOR_LOG,
				present: logLines.length > 0,
				lastRun: last,
				recent: logLines.slice(-12),
			},
			visits: {
				total: visits.total,
				oldestMs: visits.oldest,
				newestMs: visits.newest,
				retentionDays: Number(process.env.VISITS_RETENTION_DAYS || 0),
			},
			timestamp: Date.now(),
		});
	} catch (err: any) {
		return json({ error: err?.message || 'storage failed' }, { status: 500 });
	}
};
