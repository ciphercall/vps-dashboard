import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProject } from '$lib/server/projects';
import { getVisits, getVisitCount } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, url }) => {
	const project = getProject(params.id);
	if (!project) throw error(404, 'project not found');

	const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 500);
	const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

	try {
		const visits = getVisits(params.id, { limit, offset });
		const total = getVisitCount(params.id);
		return json({ visits, total, limit, offset });
	} catch (err: any) {
		return json({ error: err?.message || 'visits failed', visits: [], total: 0 }, { status: 500 });
	}
};