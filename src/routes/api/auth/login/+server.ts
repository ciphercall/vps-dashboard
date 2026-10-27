import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	SESSION_COOKIE_NAME,
	signSession,
	getAdminUser,
	verifyPassword,
} from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		let username = '';
		let password = '';
		const ct = request.headers.get('content-type') || '';
		if (ct.includes('application/json')) {
			const body = await request.json().catch(() => ({}));
			username = body?.username || body?.user || '';
			password = body?.password || '';
		} else {
			const form = await request.formData().catch(() => null);
			if (form) {
				username = String(form.get('username') || form.get('user') || '');
				password = String(form.get('password') || '');
			}
		}

		const adminUser = getAdminUser();
		if (username !== adminUser || !verifyPassword(password)) {
			return json({ ok: false, error: 'invalid credentials' }, { status: 401 });
		}

		const token = signSession(username);
		cookies.set(SESSION_COOKIE_NAME, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: 7 * 24 * 60 * 60
		});

		if (!ct.includes('application/json')) {
			throw redirect(303, '/');
		}
		return json({ ok: true, redirect: '/' });
	} catch (err: any) {
		if (err?.status === 303) throw err;
		return json({ error: err?.message || 'login failed' }, { status: 500 });
	}
};