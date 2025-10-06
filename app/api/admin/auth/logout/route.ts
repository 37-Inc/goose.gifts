import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/admin/auth';
import { logAdminAction } from '@/lib/admin/audit';

export async function POST() {
  try {
    // Log before destroying session
    await logAdminAction('logout');

    // Destroy session
    await destroySession();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during logout' },
      { status: 500 }
    );
  }
}
