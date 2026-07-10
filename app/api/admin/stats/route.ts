import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productClicks, products, searchQueries } from '@/lib/db/schema';
import { isAuthenticated } from '@/lib/admin/auth';
import { desc, gte, sql } from 'drizzle-orm';
import type { AdminApiResponse, DashboardStats } from '@/lib/admin/types';

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productCtr(clicks: number, impressions: number): number {
  if (impressions <= 0) {
    return 0;
  }

  return Math.round((clicks / impressions) * 10000) / 100;
}

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

    const [
      todayProductClicksResult,
      todaySearchesResult,
      todayProductsUpdatedResult,
      catalogResult,
      totalProductClicksResult,
      totalProductImpressionsResult,
      clickSources,
      acquisitionSources,
      campaignClicks,
      topProducts,
      recentProducts,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(productClicks)
        .where(gte(productClicks.createdAt, todayStart)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(searchQueries)
        .where(gte(searchQueries.createdAt, todayStart)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(gte(products.updatedAt, todayStart)),
      db
        .select({
          totalProducts: sql<number>`count(*)`,
          activeProducts: sql<number>`count(*) FILTER (WHERE ${products.isActive} = true)`,
          enrichedProducts: sql<number>`count(*) FILTER (
            WHERE ${products.isActive} = true
              AND ${products.imageUrl} IS NOT NULL
              AND ${products.affiliateUrl} IS NOT NULL
              AND ${products.embedding} IS NOT NULL
              AND ${products.punnyTitle} IS NOT NULL
              AND ${products.wittyDescription} IS NOT NULL
              AND ${products.humorTags} IS NOT NULL
              AND ${products.qualityScore} IS NOT NULL
          )`,
          embeddedProducts: sql<number>`count(*) FILTER (
            WHERE ${products.isActive} = true
              AND ${products.imageUrl} IS NOT NULL
              AND ${products.affiliateUrl} IS NOT NULL
              AND ${products.embedding} IS NOT NULL
          )`,
          missingEnrichment: sql<number>`count(*) FILTER (
            WHERE ${products.isActive} = true
              AND ${products.imageUrl} IS NOT NULL
              AND ${products.affiliateUrl} IS NOT NULL
              AND (
                ${products.embedding} IS NULL
                OR ${products.punnyTitle} IS NULL
                OR ${products.wittyDescription} IS NULL
                OR ${products.humorTags} IS NULL
                OR ${products.qualityScore} IS NULL
              )
          )`,
        })
        .from(products),
      db
        .select({ count: sql<number>`count(*)` })
        .from(productClicks),
      db
        .select({ total: sql<number>`COALESCE(SUM(${products.impressionCount}), 0)` })
        .from(products),
      db
        .select({
          source: productClicks.source,
          count: sql<number>`count(*)`,
        })
        .from(productClicks)
        .groupBy(productClicks.source)
        .orderBy(desc(sql<number>`count(*)`))
        .limit(8),
      db
        .select({
          source: sql<string>`COALESCE(
            NULLIF(${productClicks.utmSource}, ''),
            NULLIF(${productClicks.referrerHost}, ''),
            NULLIF(regexp_replace(COALESCE(${productClicks.referer}, ''), '^https?://([^/]+).*$', '\\1'), ''),
            'direct'
          )`,
          count: sql<number>`count(*)`,
          latestClickAt: sql<Date>`max(${productClicks.createdAt})`,
        })
        .from(productClicks)
        .where(gte(productClicks.createdAt, sql<Date>`now() - interval '90 days'`))
        .groupBy(sql`1`)
        .orderBy(desc(sql<number>`count(*)`), desc(sql<Date>`max(${productClicks.createdAt})`))
        .limit(8),
      db
        .select({
          source: sql<string>`COALESCE(NULLIF(${productClicks.utmSource}, ''), '(none)')`,
          medium: sql<string>`COALESCE(NULLIF(${productClicks.utmMedium}, ''), '(none)')`,
          campaign: sql<string>`COALESCE(NULLIF(${productClicks.utmCampaign}, ''), '(none)')`,
          count: sql<number>`count(*)`,
          latestClickAt: sql<Date>`max(${productClicks.createdAt})`,
        })
        .from(productClicks)
        .where(sql`
          ${productClicks.createdAt} >= now() - interval '90 days'
          AND (
            NULLIF(${productClicks.utmSource}, '') IS NOT NULL
            OR NULLIF(${productClicks.utmMedium}, '') IS NOT NULL
            OR NULLIF(${productClicks.utmCampaign}, '') IS NOT NULL
          )
        `)
        .groupBy(sql`1`, sql`2`, sql`3`)
        .orderBy(desc(sql<number>`count(*)`), desc(sql<Date>`max(${productClicks.createdAt})`))
        .limit(8),
      db
        .select({
          id: products.id,
          title: products.title,
          clickCount: products.clickCount,
          impressionCount: products.impressionCount,
        })
        .from(products)
        .orderBy(desc(products.clickCount))
        .limit(5),
      db
        .select({
          id: products.id,
          title: products.title,
          updatedAt: products.updatedAt,
          clickCount: products.clickCount,
          impressionCount: products.impressionCount,
        })
        .from(products)
        .orderBy(desc(products.updatedAt))
        .limit(10),
    ]);

    const totalProductClicks = asNumber(totalProductClicksResult[0]?.count);
    const totalProductImpressions = asNumber(totalProductImpressionsResult[0]?.total);
    const catalog = catalogResult[0];
    const lastCatalogUpdate = recentProducts[0]?.updatedAt;

    const stats: DashboardStats = {
      today: {
        productClicks: asNumber(todayProductClicksResult[0]?.count),
        searches: asNumber(todaySearchesResult[0]?.count),
        productsUpdated: asNumber(todayProductsUpdatedResult[0]?.count),
      },
      catalog: {
        totalProducts: asNumber(catalog?.totalProducts),
        activeProducts: asNumber(catalog?.activeProducts),
        enrichedProducts: asNumber(catalog?.enrichedProducts),
        embeddedProducts: asNumber(catalog?.embeddedProducts),
        missingEnrichment: asNumber(catalog?.missingEnrichment),
      },
      allTime: {
        productClicks: totalProductClicks,
        productImpressions: totalProductImpressions,
        averageProductCTR: productCtr(totalProductClicks, totalProductImpressions),
      },
      clickSources: clickSources.map((source) => ({
        source: source.source,
        clicks: asNumber(source.count),
      })),
      acquisitionSources: acquisitionSources.map((source) => ({
        source: source.source,
        clicks: asNumber(source.count),
        latestClickAt: source.latestClickAt,
      })),
      campaignClicks: campaignClicks.map((campaign) => ({
        source: campaign.source,
        medium: campaign.medium,
        campaign: campaign.campaign,
        clicks: asNumber(campaign.count),
        latestClickAt: campaign.latestClickAt,
      })),
      topProducts: topProducts.map((product) => {
        const clickCount = product.clickCount || 0;
        const impressionCount = product.impressionCount || 0;

        return {
          id: product.id,
          title: product.title,
          clickCount,
          impressionCount,
          ctr: productCtr(clickCount, impressionCount),
        };
      }),
      recentProducts: recentProducts.map((product) => ({
        id: product.id,
        title: product.title,
        updatedAt: product.updatedAt,
        clickCount: product.clickCount || 0,
        impressionCount: product.impressionCount || 0,
      })),
      systemHealth: {
        database: 'healthy',
        lastCatalogUpdate,
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
