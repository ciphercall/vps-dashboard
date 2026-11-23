import { redirect, json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import {
	SESSION_COOKIE_NAME,
	verifySessionToken,
} from '$lib/server/auth';
import { startIngestScheduler } from '$lib/server/ingest';
import { startMaintenanceScheduler } from '$lib/server/maintenance';

declare global {
	namespace App {
		interface Locals {
			user?: { username: string };
		}
	}
}

const PUBLIC_PATHS = [
	'/login',
	'/api/auth/login',
	'/api/auth/logout',
	'/logout',
	'/healthz',
	'/api/healthz'
];

let ingestStarted = false;
function startIngestOnce(): void {
	if (ingestStarted) return;
	ingestStarted = true;
	try {
		startIngestScheduler(30000);
	} catch {
		// ignore
	}
}

let maintenanceStarted = false;
function startMaintenanceOnce(): void {
	if (maintenanceStarted) return;
	maintenanceStarted = true;
	try {
		startMaintenanceScheduler();
	} catch {
		// ignore
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	startIngestOnce();
	startMaintenanceOnce();

	const path = event.url.pathname;

	if (path.startsWith('/_app') || path.startsWith('/favicon') || path.startsWith('/robots')) {
		return resolve(event);
	}

	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
	if (isPublic) {
		return resolve(event);
	}

	const token = event.cookies.get(SESSION_COOKIE_NAME);
	const session = verifySessionToken(token);
	if (!session) {
		if (path.startsWith('/api')) {
			return json({ error: 'unauthorized' }, { status: 401 });
		}
		throw redirect(302, '/login');
	}
	event.locals.user = { username: session.user };
	return resolve(event);
};