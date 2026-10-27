import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE_NAME } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies, request }) => {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	const ct = request.headers.get('content-type') || '';
	if (!ct.includes('application/json')) {
		throw redirect(303, '/login');
	}
	return json({ ok: true });
};

export const GET: RequestHandler = async ({ cookies }) => {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	throw redirect(303, '/login');
};