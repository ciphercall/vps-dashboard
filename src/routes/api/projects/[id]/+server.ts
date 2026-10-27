import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProject } from '$lib/server/projects';
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

export const GET: RequestHandler = async ({ params }) => {
	const project = getProject(params.id);
	if (!project) throw error(404, 'project not found');
	try {
		const [awake, gk] = await Promise.all([
			checkHealth(project.healthUrl),
			project.gatekeeper?.baseUrl
				? getGatekeeperStatus(project.gatekeeper.baseUrl).catch((e: any) => ({
						state: 'unknown',
						message: e?.message || 'unreachable'
					}))
				: Promise.resolve({ state: 'n/a (always-on)', message: 'always-on' })
		]);
		return json({
			...project,
			status: awake ? 'awake' : 'asleep',
			awake,
			gatekeeper: gk
		});
	} catch (err: any) {
		return json({ error: err?.message || 'project status failed' }, { status: 500 });
	}
};