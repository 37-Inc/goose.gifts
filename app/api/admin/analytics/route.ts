import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftBundles } from '@/lib/db/schema';
import { isAuthenticated } from '@/lib/admin/auth';
import { desc, gte, isNull, sql } from 'drizzle-orm';
import type { AdminApiResponse, AnalyticsData } from '@/lib/admin/types';

export async function GET() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as AdminApiResponse,
        { status: 401 }
      );
    }

    // Get total bundles (not deleted)
    const totalBundlesResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(giftBundles)
      .where(isNull(giftBundles.deletedAt));

    const totalBundles = Number(totalBundlesResult[0]?.count || 0);

    // Get total views
    const totalViewsResult = await db
      .select({ total: sql<number>`COALESCE(SUM(${giftBundles.viewCount}), 0)` })
      .from(giftBundles)
      .where(isNull(giftBundles.deletedAt));

    const totalViews = Number(totalViewsResult[0]?.total || 0);

    // Calculate average views per bundle
    const averageViews = totalBundles > 0 ? Math.round(totalViews / totalBundles) : 0;

    // Get top 10 most viewed bundles
    const topBundles = await db
      .select({
        slug: giftBundles.slug,
        title: giftBundles.seoTitle,
        viewCount: giftBundles.viewCount,
        createdAt: giftBundles.createdAt,
      })
      .from(giftBundles)
      .where(isNull(giftBundles.deletedAt))
      .orderBy(desc(giftBundles.viewCount))
      .limit(10);

    // Get humor style breakdown
    const humorStyleResult = await db
      .select({
        style: giftBundles.humorStyle,
        count: sql<number>`count(*)`,
      })
      .from(giftBundles)
      .where(isNull(giftBundles.deletedAt))
      .groupBy(giftBundles.humorStyle);

    const humorStyleBreakdown = humorStyleResult.map((item) => ({
      style: item.style,
      count: Number(item.count),
      percentage: totalBundles > 0 ? Math.round((Number(item.count) / totalBundles) * 100) : 0,
    }));

    // Get daily stats for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyStatsResult = await db
      .select({
        date: sql<string>`DATE(${giftBundles.createdAt})`,
        bundles: sql<number>`count(*)`,
        views: sql<number>`COALESCE(SUM(${giftBundles.viewCount}), 0)`,
      })
      .from(giftBundles)
      .where(
        gte(giftBundles.createdAt, thirtyDaysAgo)
      )
      .groupBy(sql`DATE(${giftBundles.createdAt})`)
      .orderBy(sql`DATE(${giftBundles.createdAt})`);

    const dailyStats = dailyStatsResult.map((item) => ({
      date: item.date,
      bundles: Number(item.bundles),
      views: Number(item.views),
    }));

    const analytics: AnalyticsData = {
      totalBundles,
      totalViews,
      averageViewsPerBundle: averageViews,
      topBundles: topBundles.map((bundle) => ({
        slug: bundle.slug,
        title: bundle.title || 'Untitled Bundle',
        viewCount: bundle.viewCount,
        createdAt: bundle.createdAt,
      })),
      humorStyleBreakdown,
      dailyStats,
    };

    return NextResponse.json({
      success: true,
      data: analytics,
    } as AdminApiResponse<AnalyticsData>);
  } catch (error) {
    console.error('Analytics fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch analytics',
      } as AdminApiResponse,
      { status: 500 }
    );
  }
}
