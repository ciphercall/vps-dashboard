import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProject } from '$lib/server/projects';
import { redeploy as gkRedeploy, getStatus as gkStatus } from '$lib/server/gatekeeper';

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

export const POST: RequestHandler = async ({ params }) => {
	const project = getProject(params.id);
	if (!project) throw error(404, 'project not found');
	if (!project.gatekeeper?.baseUrl) {
		return json({ error: 'no gatekeeper configured for this project' }, { status: 400 });
	}
	try {
		const gk = await gkRedeploy(project.gatekeeper.baseUrl, project.gatekeeper.adminToken);
		const [awake, status] = await Promise.all([
			checkHealth(project.healthUrl),
			gkStatus(project.gatekeeper.baseUrl).catch(() => gk)
		]);
		return json({
			ok: true,
			gatekeeper: gk,
			project: {
				...project,
				status: awake ? 'awake' : 'asleep',
				awake,
				gatekeeper: status
			}
		});
	} catch (err: any) {
		return json({ error: err?.message || 'redeploy failed' }, { status: 502 });
	}
};