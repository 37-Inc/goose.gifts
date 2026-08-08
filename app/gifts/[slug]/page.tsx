import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { ProductClickButton } from '@/components/ProductClickButton';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductImage } from '@/components/ProductImage';
import { PageHero } from '@/components/ui/PageHero';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { getGiftPageBySlug, getRelatedGiftProducts } from '@/lib/db/gift-pages';
import {
  getEditorialParagraphs,
  getGiftPath,
  getLegacyGiftRedirectPath,
  hasIndexableGiftEditorial,
} from '@/lib/gift-slugs';
import { getSiteUrl } from '@/lib/site';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface GiftPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function displayTitle(product: Product): string {
  return product.punnyTitle || product.title;
}

function formatPrice(product: Product): string {
  if (product.price <= 0) {
    return 'Check current price';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency || 'USD',
  }).format(product.price);
}

function metadataDescription(product: Product): string {
  const source = getEditorialParagraphs(product.editorialWriteup)[0]
    || product.wittyDescription
    || product.title;

  return source.length <= 158 ? source : `${source.slice(0, 155).replace(/\s+\S*$/, '').trimEnd()}…`;
}

function metadataTitle(product: Product): string {
  const title = displayTitle(product);
  const shortened = title.length <= 46
    ? title
    : `${title.slice(0, 43).replace(/\s+\S*$/, '').trimEnd()}…`;

  return `${shortened} | goose.gifts`;
}

export async function generateMetadata({ params }: GiftPageProps): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await getGiftPageBySlug(slug).catch(() => undefined);

  if (!lookup) {
    return {};
  }

  const { product, canonicalSlug } = lookup;
  const title = displayTitle(product);
  const searchTitle = metadataTitle(product);
  const description = metadataDescription(product);
  const canonicalPath = getGiftPath(canonicalSlug);
  const indexable = product.isActive && hasIndexableGiftEditorial(product);
  const ogImage = `${getSiteUrl()}/api/og/random-gift?slug=${encodeURIComponent(canonicalSlug)}`;

  return {
    title: searchTitle,
    description,
    alternates: { canonical: canonicalPath },
    robots: { index: indexable, follow: true },
    openGraph: {
      title: `${title} | goose.gifts`,
      description,
      url: canonicalPath,
      siteName: 'goose.gifts',
      type: 'website',
      images: [{
        url: ogImage,
        width: 1200,
        height: 630,
        alt: `${title} — a funny gift idea from goose.gifts`,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | goose.gifts`,
      description,
      images: [ogImage],
    },
  };
}

function buildGiftSchema(product: Product, canonicalUrl: string) {
  const title = displayTitle(product);
  const description = metadataDescription(product);
  const productSchema: Record<string, unknown> = {
    '@type': 'Product',
    '@id': `${canonicalUrl}#product`,
    name: title,
    description,
    image: product.imageUrl,
    sku: product.publicId,
    category: product.sourceQuery || 'Funny gifts',
    url: canonicalUrl,
  };

  if (product.isActive && product.price > 0) {
    productSchema.offers = {
      '@type': 'Offer',
      url: product.affiliateUrl,
      price: product.price.toFixed(2),
      priceCurrency: product.currency || 'USD',
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: product.source === 'amazon' ? 'Amazon' : 'Etsy',
      },
    };
  }

  if (product.rating && product.reviewCount) {
    productSchema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating.toFixed(1),
      reviewCount: product.reviewCount,
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        name: title,
        description,
        url: canonicalUrl,
        inLanguage: 'en-US',
        isPartOf: { '@id': `${getSiteUrl()}/#website` },
        mainEntity: { '@id': `${canonicalUrl}#product` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumbs`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: getSiteUrl(),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: title,
            item: canonicalUrl,
          },
        ],
      },
      productSchema,
    ],
  };
}

export default async function GiftPage({ params, searchParams }: GiftPageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const lookup = await getGiftPageBySlug(slug);

  if (!lookup?.product.imageUrl) {
    notFound();
  }

  if (lookup.matchedHistoricalSlug) {
    permanentRedirect(getLegacyGiftRedirectPath(lookup.canonicalSlug, query));
  }

  const product = lookup.product;
  const title = displayTitle(product);
  const canonicalUrl = `${getSiteUrl()}${getGiftPath(lookup.canonicalSlug)}`;
  const relatedProducts = await getRelatedGiftProducts(product, 6);
  const editorialParagraphs = getEditorialParagraphs(product.editorialWriteup);
  const fallbackParagraph = product.wittyDescription
    || `A funny gift picked from the goose.gifts catalog. Check the retailer listing for the exact current details.`;
  const tags = (product.humorTags || []).slice(0, 5);
  const schema = JSON.stringify(buildGiftSchema(product, canonicalUrl)).replace(/</g, '\\u003c');

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
      <Header />

      <nav className="mx-auto max-w-4xl px-4 pt-8 text-sm text-zinc-400" aria-label="Breadcrumb">
        <Link href="/" className="transition hover:text-brand">Gift catalog</Link>
        <span className="px-2" aria-hidden="true">/</span>
        <span aria-current="page">Gift idea</span>
      </nav>

      <PageHero title={title} subtitle={product.wittyDescription || 'A funny gift idea worth a closer look.'} />

      <section className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:pt-10">
        <article className="grid gap-8 rounded-3xl bg-zinc-50 p-5 ring-1 ring-zinc-950/[0.06] sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] sm:p-8">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-950/[0.05]">
            <div className="absolute inset-6 sm:inset-8">
              <ProductImage
                imageUrl={product.imageUrl}
                alt={product.title}
                className="object-contain"
                sizes="(max-width: 768px) 90vw, 42vw"
                priority
              />
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">
              <span className="text-base normal-case tracking-normal text-zinc-950">
                {product.isActive ? formatPrice(product) : 'No longer listed'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{product.source === 'amazon' ? 'Amazon' : 'Etsy'}</span>
            </div>

            <h2 className="mt-5 text-xl font-bold tracking-tight text-zinc-950">Why it works as a gift</h2>
            <div className="mt-3 space-y-4 text-[15px] leading-7 text-zinc-600">
              {(editorialParagraphs.length > 0 ? editorialParagraphs : [fallbackParagraph]).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            {tags.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Gift themes">
                {tags.map((tag) => (
                  <li key={tag} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 ring-1 ring-zinc-950/[0.06]">
                    {tag.replace(/-/g, ' ')}
                  </li>
                ))}
              </ul>
            )}

            {product.isActive ? (
              <>
                <ProductClickButton
                  product={product}
                  clickSource="gift_page"
                  contextSlug={lookup.canonicalSlug}
                  className="mt-7 inline-flex w-fit rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand"
                >
                  {product.price > 0 ? 'See it at the retailer' : 'Check price and availability'}
                </ProductClickButton>
                <p className="mt-3 max-w-sm text-xs leading-5 text-zinc-400">
                  Affiliate disclosure: goose.gifts may earn from qualifying purchases at no extra cost to you.
                </p>
              </>
            ) : (
              <p className="mt-7 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-zinc-600 ring-1 ring-zinc-950/[0.06]">
                This exact gift is no longer listed. Its page stays here so old shares still work; browse the active alternatives below.
              </p>
            )}
          </div>
        </article>
      </section>

      {relatedProducts.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <SectionHeading title="More ridiculous gifts" aside="Product pages, not surprise retailer jumps" />
          <ProductGrid
            products={relatedProducts}
            clickSource="gift_page_related"
            contextSlug={lookup.canonicalSlug}
          />
        </section>
      )}
    </main>
  );
}
