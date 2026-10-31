import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProject } from '$lib/server/projects';

export const GET: RequestHandler = async ({ params }) => {
	const project = getProject(params.id);
	if (!project) throw error(404, 'project not found');
	if (!project.gatekeeper?.baseUrl) throw error(400, 'no gatekeeper configured for this project');

	const baseUrl = project.gatekeeper.baseUrl;
	let upstream: Response;
	try {
		upstream = await fetch(`${baseUrl}/_ondemand/events`, {
			headers: { Accept: 'text/event-stream' }
		});
	} catch {
		throw error(502, 'failed to reach gatekeeper events');
	}
	if (!upstream.ok || !upstream.body) {
		throw error(502, 'gatekeeper events unavailable');
	}

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};