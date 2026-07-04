import { MetadataRoute } from 'next';
import { giftGuides } from '@/lib/gift-guides';

export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://goose.gifts';

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  const guidePages: MetadataRoute.Sitemap = giftGuides.map((guide) => ({
    url: `${baseUrl}/gift-guides/${guide.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.9,
  }));

  return [...staticPages, ...guidePages];
}
