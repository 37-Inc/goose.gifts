import { cookies } from 'next/headers';
import crypto from 'crypto';

const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Simple rate limiting store (in-memory, resets on server restart)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

interface SessionData {
  adminId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Hash a password using Node.js built-in crypto (PBKDF2)
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

/**
 * Create a secure session token
 */
function createSessionToken(data: SessionData): string {
  const secret = process.env.ADMIN_SESSION_SECRET || 'default-secret-change-me';
  const payload = JSON.stringify(data);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const token = Buffer.from(`${payload}.${signature}`).toString('base64');
  return token;
}

/**
 * Verify and decode a session token
 */
function verifySessionToken(token: string): SessionData | null {
  try {
    const secret = process.env.ADMIN_SESSION_SECRET || 'default-secret-change-me';
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [payload, signature] = decoded.split('.');

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return null;
    }

    const data = JSON.parse(payload) as SessionData;

    // Check if session has expired
    if (Date.now() > data.expiresAt) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Check if an IP is rate limited
 */
export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);

  if (!attempt) {
    return false;
  }

  // Reset if window has passed
  if (now > attempt.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }

  return attempt.count >= MAX_LOGIN_ATTEMPTS;
}

/**
 * Record a failed login attempt
 */
export function recordLoginAttempt(ip: string): void {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);

  if (!attempt || now > attempt.resetAt) {
    loginAttempts.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    });
  } else {
    attempt.count += 1;
  }
}

/**
 * Clear login attempts for an IP (on successful login)
 */
export function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * Verify the admin password
 */
export function verifyAdminPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD environment variable is not set');
    return false;
  }

  // For simplicity, we're doing a direct comparison
  // In production, you'd want to store a hash and compare that
  return password === adminPassword;
}

/**
 * Create a new admin session
 */
export async function createSession(adminId: string = 'admin'): Promise<void> {
  const now = Date.now();
  const sessionData: SessionData = {
    adminId,
    createdAt: now,
    expiresAt: now + SESSION_DURATION,
  };

  const token = createSessionToken(sessionData);
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000, // Convert to seconds
    path: '/',
  });
}

/**
 * Get the current session data
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

/**
 * Check if the current session is valid
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Destroy the current session
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

/**
 * Get admin ID from session (for audit logging)
 */
export async function getAdminId(): Promise<string | null> {
  const session = await getSession();
  return session?.adminId || null;
}
