import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftBundles } from '@/lib/db/schema';
import { isAuthenticated } from '@/lib/admin/auth';
import { and, desc, asc, gte, lte, like, or, isNull, sql } from 'drizzle-orm';
import type { AdminApiResponse, BundleListResponse } from '@/lib/admin/types';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as AdminApiResponse,
        { status: 401 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const humorStyle = searchParams.get('humorStyle');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const minViews = searchParams.get('minViews');
    const search = searchParams.get('search');

    // Build where conditions
    const conditions = [isNull(giftBundles.deletedAt)];

    if (humorStyle) {
      conditions.push(sql`${giftBundles.humorStyle} = ${humorStyle}`);
    }

    if (dateFrom) {
      conditions.push(gte(giftBundles.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(giftBundles.createdAt, endDate));
    }

    if (minViews) {
      conditions.push(gte(giftBundles.viewCount, parseInt(minViews)));
    }

    if (search) {
      conditions.push(
        or(
          like(giftBundles.slug, `%${search}%`),
          like(giftBundles.recipientDescription, `%${search}%`),
          like(giftBundles.seoTitle, `%${search}%`)
        )!
      );
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(giftBundles)
      .where(and(...conditions));

    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Get bundles with pagination and sorting
    const orderColumn = sortBy === 'viewCount' ? giftBundles.viewCount : giftBundles.createdAt;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    const bundles = await db
      .select()
      .from(giftBundles)
      .where(and(...conditions))
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset(offset);

    const response: BundleListResponse = {
      bundles,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return NextResponse.json({
      success: true,
      data: response,
    } as AdminApiResponse<BundleListResponse>);
  } catch (error) {
    console.error('Bundle list error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch bundles',
      } as AdminApiResponse,
      { status: 500 }
    );
  }
}
