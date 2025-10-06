import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftBundles } from '@/lib/db/schema';
import { isAuthenticated } from '@/lib/admin/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { eq } from 'drizzle-orm';
import type { AdminApiResponse } from '@/lib/admin/types';

// GET single bundle
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as AdminApiResponse,
        { status: 401 }
      );
    }

    const { slug } = await params;

    const bundle = await db
      .select()
      .from(giftBundles)
      .where(eq(giftBundles.slug, slug))
      .limit(1);

    if (!bundle || bundle.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Bundle not found' } as AdminApiResponse,
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: bundle[0],
    } as AdminApiResponse);
  } catch (error) {
    console.error('Bundle fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bundle' } as AdminApiResponse,
      { status: 500 }
    );
  }
}

// PATCH update bundle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as AdminApiResponse,
        { status: 401 }
      );
    }

    const { slug } = await params;
    const body = await request.json();

    // Validate what can be updated
    const allowedUpdates: Record<string, unknown> = {};

    if (body.seoTitle !== undefined) {
      allowedUpdates.seoTitle = body.seoTitle;
    }
    if (body.seoDescription !== undefined) {
      allowedUpdates.seoDescription = body.seoDescription;
    }
    if (body.giftIdeas !== undefined) {
      allowedUpdates.giftIdeas = body.giftIdeas;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid updates provided' } as AdminApiResponse,
        { status: 400 }
      );
    }

    // Add updatedAt timestamp
    allowedUpdates.updatedAt = new Date();

    // Update the bundle
    const result = await db
      .update(giftBundles)
      .set(allowedUpdates)
      .where(eq(giftBundles.slug, slug))
      .returning();

    if (!result || result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Bundle not found' } as AdminApiResponse,
        { status: 404 }
      );
    }

    // Log the action
    await logAdminAction('edit', slug, undefined, { updates: Object.keys(allowedUpdates) });

    return NextResponse.json({
      success: true,
      data: result[0],
    } as AdminApiResponse);
  } catch (error) {
    console.error('Bundle update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update bundle' } as AdminApiResponse,
      { status: 500 }
    );
  }
}

// DELETE bundle (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as AdminApiResponse,
        { status: 401 }
      );
    }

    const { slug } = await params;
    const body = await request.json();
    const reason = body.reason;

    // Soft delete - set deletedAt timestamp
    const result = await db
      .update(giftBundles)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(giftBundles.slug, slug))
      .returning();

    if (!result || result.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Bundle not found' } as AdminApiResponse,
        { status: 404 }
      );
    }

    // Log the action
    await logAdminAction('delete', slug, reason);

    return NextResponse.json({
      success: true,
      data: { message: 'Bundle deleted successfully' },
    } as AdminApiResponse);
  } catch (error) {
    console.error('Bundle delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete bundle' } as AdminApiResponse,
      { status: 500 }
    );
  }
}
