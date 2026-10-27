import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProject } from '$lib/server/projects';
import { getVisitSummary } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const project = getProject(params.id);
	if (!project) throw error(404, 'project not found');

	try {
		const summary = getVisitSummary(params.id);
		return json(summary);
	} catch (err: any) {
		return json({ error: err?.message || 'summary failed' }, { status: 500 });
	}
};