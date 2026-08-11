import { MetadataRoute } from 'next';
import { giftGuides } from '@/lib/gift-guides';
import { getSiteUrl } from '@/lib/site';
import { getIndexableGiftSitemapEntries } from '@/lib/db/gift-pages';

// Catalog jobs explicitly revalidate this path and the underlying tagged
// query. Keep a bounded fallback in case an external invalidation fails.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const giftPages = await getIndexableGiftSitemapEntries();

  // Omit lastModified until each page has a durable content-updated timestamp.
  // Using new Date() here makes every sitemap request claim that every page changed.

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/gifts`,
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/gift-guides`,
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/random-gift`,
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/weird-gift-index`,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
  ];

  const guidePages: MetadataRoute.Sitemap = giftGuides.map((guide) => ({
    url: `${baseUrl}/gift-guides/${guide.slug}`,
    changeFrequency: 'daily',
    priority: 0.9,
  }));

  const editorialGiftPages: MetadataRoute.Sitemap = giftPages.map((gift) => ({
    url: `${baseUrl}/gifts/${encodeURIComponent(gift.slug)}`,
    lastModified: gift.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticPages, ...guidePages, ...editorialGiftPages];
}
