import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { giftBundles, products, productClicks } from '@/lib/db/schema';
import { isAuthenticated } from '@/lib/admin/auth';
import { and, desc, gte, isNull, sql } from 'drizzle-orm';
import type { AdminApiResponse, DashboardStats } from '@/lib/admin/types';

export async function GET() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as AdminApiResponse,
        { status: 401 }
      );
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get today's bundles generated
    const todayBundlesResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(giftBundles)
      .where(
        and(
          gte(giftBundles.createdAt, todayStart),
          isNull(giftBundles.deletedAt)
        )
      );

    const todayBundles = Number(todayBundlesResult[0]?.count || 0);

    // Get today's views (sum of view_count for bundles created today)
    const todayViewsResult = await db
      .select({ total: sql<number>`COALESCE(SUM(${giftBundles.viewCount}), 0)` })
      .from(giftBundles)
      .where(
        and(
          gte(giftBundles.createdAt, todayStart),
          isNull(giftBundles.deletedAt)
        )
      );

    const todayViews = Number(todayViewsResult[0]?.total || 0);

    // Get today's clicks (sum of click_count for bundles created today)
    const todayClicksResult = await db
      .select({ total: sql<number>`COALESCE(SUM(${giftBundles.clickCount}), 0)` })
      .from(giftBundles)
      .where(
        and(
          gte(giftBundles.createdAt, todayStart),
          isNull(giftBundles.deletedAt)
        )
      );

    const todayClicks = Number(todayClicksResult[0]?.total || 0);

    // Get today's deleted bundles
    const todayDeletedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(giftBundles)
      .where(gte(giftBundles.deletedAt, todayStart));

    const todayDeleted = Number(todayDeletedResult[0]?.count || 0);

    // Get today's product clicks
    const todayProductClicksResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(productClicks)
      .where(gte(productClicks.createdAt, todayStart));

    const todayProductClicks = Number(todayProductClicksResult[0]?.count || 0);

    // Get all-time total bundles (not deleted)
    const totalBundlesResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(giftBundles)
      .where(isNull(giftBundles.deletedAt));

    const totalBundles = Number(totalBundlesResult[0]?.count || 0);

    // Get all-time total views
    const totalViewsResult = await db
      .select({ total: sql<number>`COALESCE(SUM(${giftBundles.viewCount}), 0)` })
      .from(giftBundles)
      .where(isNull(giftBundles.deletedAt));

    const totalViews = Number(totalViewsResult[0]?.total || 0);

    // Get all-time total clicks
    const totalClicksResult = await db
      .select({ total: sql<number>`COALESCE(SUM(${giftBundles.clickCount}), 0)` })
      .from(giftBundles)
      .where(isNull(giftBundles.deletedAt));

    const totalClicks = Number(totalClicksResult[0]?.total || 0);

    // Get all-time total product clicks
    const totalProductClicksResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(productClicks);

    const totalProductClicks = Number(totalProductClicksResult[0]?.count || 0);

    // Get total product impressions
    const totalProductImpressionsResult = await db
      .select({ total: sql<number>`COALESCE(SUM(${products.impressionCount}), 0)` })
      .from(products);

    const totalProductImpressions = Number(totalProductImpressionsResult[0]?.total || 0);

    // Calculate average product CTR
    const averageProductCTR = totalProductImpressions > 0
      ? (totalProductClicks / totalProductImpressions) * 100
      : 0;

    // Get top 5 products by clicks
    const topProducts = await db
      .select({
        id: products.id,
        title: products.title,
        clickCount: products.clickCount,
        impressionCount: products.impressionCount,
      })
      .from(products)
      .orderBy(desc(products.clickCount))
      .limit(5);

    // Calculate average views and clicks per bundle
    const averageViews = totalBundles > 0 ? Math.round(totalViews / totalBundles) : 0;
    const averageClicks = totalBundles > 0 ? Math.round(totalClicks / totalBundles) : 0;

    // Get recent bundles (last 10)
    const recentBundles = await db
      .select({
        slug: giftBundles.slug,
        title: giftBundles.seoTitle,
        createdAt: giftBundles.createdAt,
        viewCount: giftBundles.viewCount,
      })
      .from(giftBundles)
      .where(isNull(giftBundles.deletedAt))
      .orderBy(desc(giftBundles.createdAt))
      .limit(10);

    // Get last generation time (most recent bundle)
    const lastGeneration = recentBundles.length > 0 ? recentBundles[0].createdAt : undefined;

    const stats: DashboardStats = {
      today: {
        bundlesGenerated: todayBundles,
        totalViews: todayViews,
        totalClicks: todayClicks,
        bundlesDeleted: todayDeleted,
        productClicks: todayProductClicks,
      },
      allTime: {
        totalBundles,
        totalViews,
        totalClicks,
        averageViewsPerBundle: averageViews,
        averageClicksPerBundle: averageClicks,
        productClicks: totalProductClicks,
        productImpressions: totalProductImpressions,
        averageProductCTR: Math.round(averageProductCTR * 100) / 100,
      },
      topProducts: topProducts.map(product => ({
        id: product.id,
        title: product.title,
        clickCount: product.clickCount || 0,
        impressionCount: product.impressionCount || 0,
        ctr: product.impressionCount && product.impressionCount > 0
          ? Math.round(((product.clickCount || 0) / product.impressionCount) * 10000) / 100
          : 0,
      })),
      recentBundles: recentBundles.map((bundle) => ({
        slug: bundle.slug,
        title: bundle.title || 'Untitled Bundle',
        createdAt: bundle.createdAt,
        viewCount: bundle.viewCount,
      })),
      systemHealth: {
        database: 'healthy',
        lastGeneration,
      },
    };

    return NextResponse.json({
      success: true,
      data: stats,
    } as AdminApiResponse<DashboardStats>);
  } catch (error) {
    console.error('Stats fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch stats',
      } as AdminApiResponse,
      { status: 500 }
    );
  }
}
