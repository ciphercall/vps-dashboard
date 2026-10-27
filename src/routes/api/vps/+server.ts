import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVpsInfo } from '$lib/server/metrics';

export const GET: RequestHandler = async () => {
	try {
		const info = await getVpsInfo();
		return json(info);
	} catch (err: any) {
		return json({ error: err?.message || 'vps info failed' }, { status: 500 });
	}
};