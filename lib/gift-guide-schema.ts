import { getGiftGuideFaqs } from './gift-guide-editorial';
import type { GiftGuideDefinition } from './gift-guides';
import { getSiteUrl } from './site';
import type { Product } from './types';

export function buildGuideSchema(
  products: Product[],
  guide: GiftGuideDefinition,
  url: string,
) {
  const faqs = getGiftGuideFaqs(guide);
  const siteUrl = getSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        name: guide.title,
        headline: guide.h1,
        description: guide.description,
        url,
        inLanguage: 'en-US',
        isPartOf: {
          '@type': 'WebSite',
          name: 'goose.gifts',
          url: siteUrl,
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumbs`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: siteUrl,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: guide.title,
            item: url,
          },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#products`,
        name: guide.title,
        description: guide.description,
        url,
        numberOfItems: products.length,
        itemListElement: products.slice(0, 24).map((product, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: product.slug
            ? `${siteUrl}/gifts/${encodeURIComponent(product.slug)}`
            : product.affiliateUrl,
          name: product.punnyTitle || product.title,
          image: product.imageUrl,
          description: product.wittyDescription || product.sourceQuery || product.title,
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ],
  };
}
