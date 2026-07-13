import { MetadataRoute } from 'next';
import { giftGuides } from '@/lib/gift-guides';
import { getSiteUrl } from '@/lib/site';

export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();

  // Omit lastModified until each page has a durable content-updated timestamp.
  // Using new Date() here makes every sitemap request claim that every page changed.

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/gift-guides`,
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

  return [...staticPages, ...guidePages];
}
