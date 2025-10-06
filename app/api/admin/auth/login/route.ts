import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminPassword,
  createSession,
  isRateLimited,
  recordLoginAttempt,
  clearLoginAttempts,
} from '@/lib/admin/auth';
import { logAdminAction } from '@/lib/admin/audit';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }

    // Get IP for rate limiting
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    // Check rate limiting
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Verify password
    const isValid = verifyAdminPassword(password);

    if (!isValid) {
      recordLoginAttempt(ip);
      return NextResponse.json(
        { success: false, error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Clear rate limit on successful login
    clearLoginAttempts(ip);

    // Create session
    await createSession();

    // Log the action (will happen after session is created)
    await logAdminAction('login');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
