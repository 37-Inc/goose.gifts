import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/admin/auth';

export async function GET() {
  try {
    const authenticated = await isAuthenticated();

    return NextResponse.json({
      success: true,
      authenticated,
    });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during verification' },
      { status: 500 }
    );
  }
}
