/**
 * Auth helpers for cabe-chatbot (Worker B).
 *
 * - Password hashing: PBKDF2-SHA256, 100.000 iterations via WebCrypto.
 * - Session tokens: base64url(JSON payload {uid, exp}) + '.' + base64url(HMAC-SHA256 signature).
 * - Cookie: `session`, HttpOnly; Path=/; SameSite=Lax; Max-Age=604800; Secure (https only).
 */

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'pro';
  widget_key: string | null;
};

type SessionPayload = {
  uid: string;
  exp: number;
};

const SESSION_COOKIE_NAME = 'session';
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days
const PBKDF2_ITERATIONS = 100_000;

function getAuthSecret(env: { AUTH_SECRET?: string }): string {
  return env.AUTH_SECRET || 'dev-secret-change-me';
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function utf8ToBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA256, 100k iterations)
// ---------------------------------------------------------------------------

export async function hashPassword(
  password: string,
  saltHex?: string
): Promise<{ passwordHash: string; salt: string }> {
  const salt = saltHex || bufferToHex(crypto.getRandomValues(new Uint8Array(16)).buffer);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    utf8ToBuffer(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return { passwordHash: bufferToHex(bits), salt };
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Constant-time-ish comparison of two hex strings (compare every position).
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHashHex: string
): Promise<boolean> {
  const { passwordHash } = await hashPassword(password, saltHex);
  return timingSafeEqualHex(passwordHash, expectedHashHex);
}

// ---------------------------------------------------------------------------
// Session tokens (HMAC-SHA256)
// ---------------------------------------------------------------------------

async function hmacSign(payloadB64Url: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8ToBuffer(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, utf8ToBuffer(payloadB64Url));
  return bufferToBase64Url(signature);
}

export async function signSession(uid: string, secret: string): Promise<string> {
  const payload: SessionPayload = {
    uid,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const payloadB64Url = bufferToBase64Url(utf8ToBuffer(JSON.stringify(payload)));
  const signature = await hmacSign(payloadB64Url, secret);
  return `${payloadB64Url}.${signature}`;
}

export async function verifySession(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [payloadB64Url, signatureB64Url] = parts;

  const expectedSignature = await hmacSign(payloadB64Url, secret);
  if (!timingSafeEqualHex(toHex(expectedSignature), toHex(signatureB64Url))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBuffer(payloadB64Url))
    ) as SessionPayload;

    if (!payload || typeof payload.uid !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function toHex(base64Url: string): string {
  const bytes = new Uint8Array(base64UrlToBuffer(base64Url));
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Secure cookie flag should only be set for https requests.
 * Skipped when the host is localhost (even if served over https via a tunnel).
 */
export function isSecureRequest(requestUrl: string): boolean {
  try {
    const url = new URL(requestUrl);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return false;
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildSessionCookie(token: string, isHttps: boolean): string {
  const flags = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_DURATION_SECONDS}`,
  ];
  if (isHttps) flags.push('Secure');
  return flags.join('; ');
}

export function buildLogoutCookie(isHttps: boolean): string {
  const flags = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttps) flags.push('Secure');
  return flags.join('; ');
}

export function getSessionTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value = trimmed.slice(eq + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hono context helpers
// ---------------------------------------------------------------------------

type EnvWithAuth = {
  Bindings: {
    DB: D1Database;
    AUTH_SECRET?: string;
  };
};

export function generateWidgetKey(): string {
  return 'wgt_' + crypto.randomUUID().replace(/-/g, '');
}

/**
 * Resolve the authenticated user from the request's `session` cookie.
 * Verifies the HMAC signature + expiry, then loads the user from D1.
 * Returns null when unauthenticated.
 */
export async function getAuthUser(c: {
  env: EnvWithAuth['Bindings'];
  req: { header: (name: string) => string | undefined };
}): Promise<AuthUser | null> {
  const secret = getAuthSecret(c.env);
  if (!secret || secret === '') return null;

  const token = getSessionTokenFromCookie(c.req.header('Cookie'));
  if (!token) return null;

  const payload = await verifySession(token, secret);
  if (!payload) return null;

  let row: any = null;
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, email, name, plan, widget_key FROM users WHERE id = ?'
    )
      .bind(payload.uid)
      .all();
    row = results && results[0];
  } catch {
    try {
      const { results } = await c.env.DB.prepare(
        'SELECT id, email, name FROM users WHERE id = ?'
      )
        .bind(payload.uid)
        .all();
      row = results && results[0];
    } catch {
      return null;
    }
  }

  if (!row || typeof row.id !== 'string' || typeof row.email !== 'string') {
    return null;
  }

  const plan: 'free' | 'pro' = row.plan === 'pro' ? 'pro' : 'free';
  const widget_key = typeof row.widget_key === 'string' ? row.widget_key : null;

  return {
    id: row.id,
    email: row.email,
    name: row.name === null || row.name === undefined ? null : String(row.name),
    plan,
    widget_key,
  };
}

/**
 * Hono middleware factory. Guards routes: 401 JSON when unauthenticated,
 * sets `c.set('user', user)` when successful.
 */
export function requireAuth() {
  return async (c: any, next: () => Promise<void>) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('user', user);
    await next();
  };
}
