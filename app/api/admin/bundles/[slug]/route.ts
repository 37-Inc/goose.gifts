import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftBundles } from '@/lib/db/schema';
import { isAuthenticated } from '@/lib/admin/auth';
import { logAdminAction } from '@/lib/admin/audit';
import { eq } from 'drizzle-orm';
import { getGiftBundleBySlug, updateBundleGiftIdeas } from '@/lib/db/operations';
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

    // Use the new operation that returns bundle with nested gift ideas
    const bundle = await getGiftBundleBySlug(slug);

    if (!bundle) {
      return NextResponse.json(
        { success: false, error: 'Bundle not found' } as AdminApiResponse,
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: bundle,
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

    // Get the bundle to obtain its ID
    const [bundle] = await db
      .select()
      .from(giftBundles)
      .where(eq(giftBundles.slug, slug))
      .limit(1);

    if (!bundle) {
      return NextResponse.json(
        { success: false, error: 'Bundle not found' } as AdminApiResponse,
        { status: 404 }
      );
    }

    // Validate what can be updated
    const allowedUpdates: Record<string, unknown> = {};
    let updateGiftIdeas = false;

    if (body.seoTitle !== undefined) {
      allowedUpdates.seoTitle = body.seoTitle;
    }
    if (body.seoDescription !== undefined) {
      allowedUpdates.seoDescription = body.seoDescription;
    }
    if (body.seoContent !== undefined) {
      allowedUpdates.seoContent = body.seoContent;
    }
    if (body.seoKeywords !== undefined) {
      allowedUpdates.seoKeywords = body.seoKeywords;
    }
    if (body.giftIdeas !== undefined) {
      // Validate giftIdeas structure
      if (!Array.isArray(body.giftIdeas)) {
        return NextResponse.json(
          { success: false, error: 'giftIdeas must be an array' } as AdminApiResponse,
          { status: 400 }
        );
      }

      // Validate each gift idea has at least one product
      for (const idea of body.giftIdeas) {
        if (!idea.products || !Array.isArray(idea.products) || idea.products.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Each gift idea must have at least one product' } as AdminApiResponse,
            { status: 400 }
          );
        }
      }

      updateGiftIdeas = true;
    }

    if (Object.keys(allowedUpdates).length === 0 && !updateGiftIdeas) {
      return NextResponse.json(
        { success: false, error: 'No valid updates provided' } as AdminApiResponse,
        { status: 400 }
      );
    }

    // Update SEO metadata if provided
    if (Object.keys(allowedUpdates).length > 0) {
      allowedUpdates.updatedAt = new Date();

      await db
        .update(giftBundles)
        .set(allowedUpdates)
        .where(eq(giftBundles.slug, slug));
    }

    // Update gift ideas if provided (uses relational tables)
    if (updateGiftIdeas) {
      await updateBundleGiftIdeas(bundle.id, body.giftIdeas);

      await db
        .update(giftBundles)
        .set({ updatedAt: new Date() })
        .where(eq(giftBundles.slug, slug));
    }

    // Log the action
    const updates = [...Object.keys(allowedUpdates)];
    if (updateGiftIdeas) updates.push('giftIdeas');
    await logAdminAction('edit', slug, undefined, { updates });

    // Fetch the updated bundle with nested data
    const updatedBundle = await getGiftBundleBySlug(slug);

    return NextResponse.json({
      success: true,
      data: updatedBundle,
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
