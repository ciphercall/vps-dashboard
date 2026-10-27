import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'dashboard_session';

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function sessionSecret(): string {
  return env('SESSION_SECRET', '');
}

function adminUser(): string {
  return env('ADMIN_USER', 'admin');
}

function adminPass(): string {
  return env('ADMIN_PASS', '');
}

export function getAdminUser(): string {
  return adminUser();
}

export function getAdminPass(): string {
  return adminPass();
}

/**
 * Timing-safe password comparison. Returns true only when the supplied
 * password exactly matches the expected (env) password.
 */
export function verifyPassword(
  input: string,
  expected: string = adminPass()
): boolean {
  const a = Buffer.from(String(input ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (a.length === 0 || a.length !== b.length) {
    // Still do a dummy compare to avoid trivial short-circuit timing leaks.
    try {
      timingSafeEqual(a.length ? a : Buffer.alloc(1), b.length ? b : Buffer.alloc(1));
    } catch {
      /* ignore */
    }
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Create a signed session token. Format: base64url(payload).base64url(hmac)
 * where payload contains the user and issued-at timestamp.
 */
export function createSessionToken(user: string = adminUser()): string {
  const payload = Buffer.from(
    JSON.stringify({ u: user, iat: Date.now() }),
    'utf8'
  ).toString('base64url');
  const sig = createHmac('sha256', sessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Back-compat alias matching the plan wording ("HMAC of SESSION_SECRET + user").
 */
export function signSession(user: string = adminUser()): string {
  return createSessionToken(user);
}

export function createSessionCookie(user: string = adminUser()): string {
  return createSessionToken(user);
}

export interface SessionPayload {
  user: string;
  iat?: number;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let data: any;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data.u !== 'string') return null;
  // Single-admin model: token user must match configured admin user.
  if (data.u !== adminUser()) return null;
  return { user: data.u, iat: data.iat };
}

export function verifySession(cookieValue: string | undefined | null): boolean {
  return verifySessionToken(cookieValue) !== null;
}

export function verifyCookie(cookieValue: string | undefined | null): SessionPayload | null {
  return verifySessionToken(cookieValue);
}

/**
 * Extract and verify the session from a raw Cookie header or a cookies map.
 */
export function getSessionFromCookie(
  cookieHeaderOrValue: string | Record<string, string> | undefined | null
): SessionPayload | null {
  if (!cookieHeaderOrValue) return null;
  let value: string | undefined;
  if (typeof cookieHeaderOrValue === 'string') {
    // Could be either the raw cookie header or the already-extracted value.
    if (cookieHeaderOrValue.includes('=')) {
      const match = cookieHeaderOrValue
        .split(';')
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`));
      value = match ? decodeURIComponent(match.slice(SESSION_COOKIE_NAME.length + 1)) : undefined;
      // If not found, treat the whole string as a token attempt.
      if (!value) value = cookieHeaderOrValue;
    } else {
      value = cookieHeaderOrValue;
    }
  } else {
    value = cookieHeaderOrValue[SESSION_COOKIE_NAME];
  }
  return verifySessionToken(value ?? null);
}

export function isAuthenticated(
  cookies: { get?: (name: string) => string | undefined } | Record<string, string> | undefined | null
): boolean {
  if (!cookies) return false;
  let value: string | undefined;
  if (typeof (cookies as any).get === 'function') {
    value = (cookies as any).get(SESSION_COOKIE_NAME);
  } else {
    value = (cookies as any)[SESSION_COOKIE_NAME];
  }
  return verifySession(value) ;
}

export function clearSessionCookieValue(): string {
  return '';
}

// Aliases for route consumers that may expect different names.
export const checkPassword = verifyPassword;
export const validatePassword = verifyPassword;
export const createToken = createSessionToken;
export const verifyToken = verifySessionToken;
export const verifyCookieToken = verifySessionToken;

export default {
  SESSION_COOKIE_NAME,
  verifyPassword,
  checkPassword,
  validatePassword,
  createSessionToken,
  signSession,
  createSessionCookie,
  createToken,
  verifySessionToken,
  verifyToken,
  verifyCookieToken,
  verifySession,
  verifyCookie,
  getSessionFromCookie,
  isAuthenticated,
  getAdminUser,
  getAdminPass,
};