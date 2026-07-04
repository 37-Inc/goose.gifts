import { sql } from 'drizzle-orm';
import { db } from './db/index';
import { products } from './db/schema';
import { cleanImageUrl } from './image-utils';
import type { Product } from './types';

export interface GiftGuideDefinition {
  slug: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  keywords: string[];
}

export const giftGuides: GiftGuideDefinition[] = [
  {
    slug: 'white-elephant-gifts',
    title: 'Funny White Elephant Gifts',
    h1: 'Funny white elephant gifts that actually get picked',
    description: 'Browse funny white elephant gifts, party exchange ideas, and weird novelty products with real images and current affiliate links.',
    intro: 'A fast shortlist for gift exchanges where the goal is funny, useful, and just strange enough to get stolen twice.',
    keywords: ['white elephant', 'secret santa', 'party', 'exchange', 'holiday', 'funny', 'gag'],
  },
  {
    slug: 'funny-gifts-for-coworkers',
    title: 'Funny Gifts for Coworkers',
    h1: 'Funny gifts for coworkers that stay office-safe',
    description: 'Find funny gifts for coworkers, desk toys, meeting jokes, and office-safe gag gifts from the goose.gifts catalog.',
    intro: 'Office gifts need a narrow lane: funny enough to land, safe enough to hand over in daylight, and useful enough to avoid the junk drawer.',
    keywords: ['coworker', 'office', 'desk', 'boss', 'meeting', 'work', 'safe'],
  },
  {
    slug: 'funny-gifts-for-dads',
    title: 'Funny Gifts for Dads',
    h1: 'Funny gifts for dads, grandpas, and proud pun collectors',
    description: 'Shop funny dad gifts, grandpa gag gifts, punny finds, and practical novelty products with real catalog items.',
    intro: 'For dads who already own the socks, the mug, and the opinion about the thermostat. These skew practical, punny, and proudly unnecessary.',
    keywords: ['dad', 'father', 'grandpa', 'pun', 'joke', 'gadget', 'grill'],
  },
  {
    slug: 'weird-kitchen-gadgets',
    title: 'Weird Kitchen Gadgets',
    h1: 'Weird kitchen gadgets for cooks with a sense of humor',
    description: 'Browse weird kitchen gadgets, funny mugs, cooking oddities, and novelty food gifts from the goose.gifts catalog.',
    intro: 'Kitchen gifts work best when they are useful at least once and funny every time they come out of a drawer.',
    keywords: ['kitchen', 'cook', 'cooking', 'mug', 'coffee', 'ramen', 'food'],
  },
  {
    slug: 'novelty-desk-toys',
    title: 'Novelty Desk Toys',
    h1: 'Novelty desk toys for bored hands and bad meetings',
    description: 'Find novelty desk toys, office gadgets, fidgets, and small funny gifts for workspaces and home offices.',
    intro: 'Small desk gifts earn their spot by being glanceable, fiddly, and just distracting enough between calls.',
    keywords: ['desk', 'toy', 'office', 'fidget', 'work', 'meeting', 'gadget'],
  },
];

export function getGiftGuide(slug: string): GiftGuideDefinition | undefined {
  return giftGuides.find((guide) => guide.slug === slug);
}

function productSearchText(product: Product): string {
  return [
    product.title,
    product.punnyTitle,
    product.wittyDescription,
    product.sourceQuery,
    ...(product.humorTags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function keywordMatchScore(product: Product, keywords: string[]): number {
  const haystack = productSearchText(product);
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

export async function getGiftGuideProducts(
  guide: GiftGuideDefinition,
  limit: number = 36
): Promise<Product[]> {
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      punnyTitle: products.punnyTitle,
      wittyDescription: products.wittyDescription,
      humorTags: products.humorTags,
      qualityScore: products.qualityScore,
      sourceQuery: products.sourceQuery,
      isActive: products.isActive,
      price: products.price,
      currency: products.currency,
      imageUrl: products.imageUrl,
      affiliateUrl: products.affiliateUrl,
      source: products.source,
      rating: products.rating,
      reviewCount: products.reviewCount,
      clickCount: products.clickCount,
      impressionCount: products.impressionCount,
    })
    .from(products)
    .where(sql`
      ${products.isActive} = true
      AND ${products.imageUrl} IS NOT NULL
      AND ${products.affiliateUrl} IS NOT NULL
      AND (${products.price} <= 0 OR ${products.price} <= 250)
    `)
    .orderBy(sql`${products.qualityScore} DESC NULLS LAST, ${products.clickCount} DESC, ${products.impressionCount} DESC`)
    .limit(750);

  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      punnyTitle: row.punnyTitle || undefined,
      wittyDescription: row.wittyDescription || undefined,
      humorTags: row.humorTags || undefined,
      qualityScore: row.qualityScore ? parseFloat(row.qualityScore) : undefined,
      sourceQuery: row.sourceQuery || undefined,
      isActive: row.isActive,
      price: parseFloat(row.price),
      currency: row.currency,
      imageUrl: cleanImageUrl(row.imageUrl || '', row.source),
      affiliateUrl: row.affiliateUrl,
      source: row.source as 'amazon' | 'etsy',
      rating: row.rating ? parseFloat(row.rating) : undefined,
      reviewCount: row.reviewCount || undefined,
      clickCount: row.clickCount || 0,
      impressionCount: row.impressionCount || 0,
    }))
    .map((product) => ({
      product,
      matchScore: keywordMatchScore(product, guide.keywords),
    }))
    .filter(({ matchScore }) => matchScore > 0)
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return (b.product.qualityScore ?? 0) - (a.product.qualityScore ?? 0);
    })
    .slice(0, limit)
    .map(({ product }) => product);
}
