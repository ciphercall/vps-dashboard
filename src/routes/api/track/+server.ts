import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordVisit } from '$lib/server/ingest';

function extractIp(request: Request, getClientAddress: () => string): string {
	const xff = request.headers.get('x-forwarded-for');
	if (xff) {
		const first = xff.split(',')[0].trim();
		if (first) return first;
	}
	const xri = request.headers.get('x-real-ip');
	if (xri) return xri.trim();
	try {
		return getClientAddress();
	} catch {
		return 'unknown';
	}
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const projectId = body?.project_id || body?.projectId || 'unknown';
		const ip = extractIp(request, getClientAddress);
		const path = body?.path || null;
		const userAgent = body?.user_agent || request.headers.get('user-agent') || null;
		const status = typeof body?.status === 'number' ? body.status : null;
		const ts = Date.now();

		await recordVisit({
			project_id: projectId,
			ip,
			path,
			user_agent: userAgent,
			status,
			ts
		});

		return json({ ok: true, ip });
	} catch (err: any) {
		return json({ error: err?.message || 'track failed' }, { status: 500 });
	}
};