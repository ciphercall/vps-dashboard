import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMetrics } from '$lib/server/metrics';

export const GET: RequestHandler = async () => {
	try {
		const metrics = await getMetrics();
		return json(metrics);
	} catch (err: any) {
		return json({ error: err?.message || 'metrics failed' }, { status: 500 });
	}
};