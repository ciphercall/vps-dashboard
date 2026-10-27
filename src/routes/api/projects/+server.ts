import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadProjects } from '$lib/server/projects';
import { getStatus as getGatekeeperStatus } from '$lib/server/gatekeeper';

async function checkHealth(url: string): Promise<boolean> {
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

export const GET: RequestHandler = async () => {
	try {
		const projects = loadProjects();
		const enriched = await Promise.all(
			projects.map(async (p) => {
				const [awake, gk] = await Promise.all([
					checkHealth(p.healthUrl),
					p.gatekeeper?.baseUrl
						? getGatekeeperStatus(p.gatekeeper.baseUrl).catch((e: any) => ({
								state: 'unknown',
								message: e?.message || 'unreachable'
							}))
						: Promise.resolve({ state: 'n/a (always-on)', message: 'always-on' })
				]);
				return {
					...p,
					status: awake ? 'awake' : 'asleep',
					awake,
					gatekeeper: gk
				};
			})
		);
		return json({ projects: enriched });
	} catch (err: any) {
		return json({ error: err?.message || 'projects failed', projects: [] }, { status: 500 });
	}
};