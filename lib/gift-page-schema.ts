import type { Product } from './types';

const FRESH_OFFER_WINDOW_MS = 60 * 60 * 1000;
const PURCHASABLE_AVAILABILITY = new Set([
  'IN_STOCK',
  'IN_STOCK_SCARCE',
  'INSTOCKSCARCE',
  'PREORDER',
]);

export function hasUsableRetailerDestination(product: Product): boolean {
  const status = String(product.availabilityStatus || '').toUpperCase();
  let destination: URL;

  try {
    destination = new URL(product.affiliateUrl.trim());
  } catch {
    return false;
  }

  return destination.protocol === 'https:'
    && product.isActive !== false
    && !['OUTOFSTOCK', 'OUT_OF_STOCK', 'UNAVAILABLE'].includes(status);
}

export function hasFreshGiftOffer(product: Product, now = new Date()): boolean {
  const checkedAt = product.availabilityCheckedAt
    ? new Date(product.availabilityCheckedAt).getTime()
    : Number.NaN;

  return product.price > 0
    && PURCHASABLE_AVAILABILITY.has(String(product.availabilityStatus || '').toUpperCase())
    && Number.isFinite(checkedAt)
    && now.getTime() - checkedAt <= FRESH_OFFER_WINDOW_MS;
}

function schemaAvailability(status?: string): string | undefined {
  switch (String(status || '').toUpperCase()) {
    case 'IN_STOCK':
      return 'https://schema.org/InStock';
    case 'IN_STOCK_SCARCE':
    case 'INSTOCKSCARCE':
      return 'https://schema.org/LimitedAvailability';
    case 'PREORDER':
      return 'https://schema.org/PreOrder';
    default:
      return undefined;
  }
}

export function buildGiftPageSchema(
  product: Product,
  canonicalUrl: string,
  title: string,
  description: string,
  siteUrl: string,
  now = new Date()
) {
  const webPageSchema: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    name: title,
    description,
    url: canonicalUrl,
    inLanguage: 'en-US',
    isPartOf: { '@id': `${siteUrl}/#website` },
  };
  const graph: Record<string, unknown>[] = [
    webPageSchema,
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumbs`,
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
          name: title,
          item: canonicalUrl,
        },
      ],
    },
  ];

  const offerAvailability = schemaAvailability(product.availabilityStatus);
  if (hasUsableRetailerDestination(product) && hasFreshGiftOffer(product, now) && offerAvailability) {
    const productId = `${canonicalUrl}#product`;
    const productSchema: Record<string, unknown> = {
      '@type': 'Product',
      '@id': productId,
      name: title,
      description,
      sku: product.publicId,
      category: product.sourceQuery || 'Funny gifts',
      url: canonicalUrl,
      offers: {
        '@type': 'Offer',
        url: product.affiliateUrl,
        price: product.price.toFixed(2),
        priceCurrency: product.currency || 'USD',
        availability: offerAvailability,
        seller: {
          '@type': 'Organization',
          name: product.source === 'amazon' ? 'Amazon' : 'Etsy',
        },
      },
    };
    if (product.imageUrl) productSchema.image = product.imageUrl;

    webPageSchema.mainEntity = { '@id': productId };
    graph.push(productSchema);
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}
