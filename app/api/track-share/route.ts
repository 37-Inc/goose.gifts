import { NextRequest, NextResponse } from 'next/server';
import { incrementShareCount } from '@/lib/db/operations';

export async function POST(request: NextRequest) {
  try {
    const { slug, platform } = await request.json();

    if (!slug || !platform) {
      return NextResponse.json(
        { error: 'Missing slug or platform' },
        { status: 400 }
      );
    }

    // Increment share count in database
    await incrementShareCount(slug);

    // Track with Google Analytics if available
    // (This is just logging for now, actual GA tracking happens client-side)
    console.log(`Share tracked: ${slug} on ${platform}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Share tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to track share' },
      { status: 500 }
    );
  }
}
