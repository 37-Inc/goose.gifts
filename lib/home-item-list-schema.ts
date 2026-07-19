import type { Product } from './types';

export function buildHomeItemListSchema(products: Product[], siteUrl: string) {
  const eligibleProducts = products
    .filter((product) => (
      product.price > 0
      || (
        typeof product.rating === 'number'
        && product.rating > 0
        && typeof product.reviewCount === 'number'
        && product.reviewCount > 0
      )
    ))
    .slice(0, 24);

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Funny Gag Gifts & White Elephant Ideas',
    description: 'Discover funny gag gifts, white elephant gift ideas, novelty products, and weird presents for every occasion.',
    url: siteUrl,
    numberOfItems: eligibleProducts.length,
    itemListElement: eligibleProducts.map((product, index) => {
      const item: Record<string, unknown> = {
        '@type': 'Product',
        name: product.punnyTitle || product.title,
        image: product.imageUrl,
        description: product.wittyDescription || product.sourceQuery || product.title,
        category: 'Gag gifts',
        url: product.affiliateUrl,
      };

      if (product.price > 0) {
        item.offers = {
          '@type': 'Offer',
          price: product.price.toFixed(2),
          priceCurrency: product.currency || 'USD',
          availability: 'https://schema.org/InStock',
          url: product.affiliateUrl,
        };
      }

      if (product.rating && product.reviewCount) {
        item.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: product.rating.toFixed(1),
          reviewCount: product.reviewCount,
        };
      }

      return {
        '@type': 'ListItem',
        position: index + 1,
        item,
      };
    }),
  };
}
