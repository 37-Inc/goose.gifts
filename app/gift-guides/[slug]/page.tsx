import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { giftGuides, getGiftGuide, getGiftGuideProducts } from '@/lib/gift-guides';
import type { Product } from '@/lib/types';

export const revalidate = 3600;

interface GiftGuidePageProps {
  params: Promise<{ slug: string }>;
}

function formatPrice(product: Product): string {
  if (product.price <= 0) return 'Check price';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency || 'USD',
  }).format(product.price);
}

function buildGuideSchema(products: Product[], title: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    description,
    url,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 24).map((product, index) => {
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

export function generateStaticParams() {
  return giftGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GiftGuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGiftGuide(slug);

  if (!guide) {
    return {};
  }

  return {
    title: `${guide.title} | goose.gifts`,
    description: guide.description,
    alternates: {
      canonical: `/gift-guides/${guide.slug}`,
    },
    openGraph: {
      title: `${guide.title} | goose.gifts`,
      description: guide.description,
      url: `/gift-guides/${guide.slug}`,
      siteName: 'goose.gifts',
      type: 'website',
      images: [
        {
          url: '/sillygoose-og.png',
          width: 1200,
          height: 630,
          alt: `${guide.title} from goose.gifts`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${guide.title} | goose.gifts`,
      description: guide.description,
      images: ['/sillygoose-og.png'],
    },
  };
}

export default async function GiftGuidePage({ params }: GiftGuidePageProps) {
  const { slug } = await params;
  const guide = getGiftGuide(slug);

  if (!guide) {
    notFound();
  }

  const products = await getGiftGuideProducts(guide, 36);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://goose.gifts';
  const canonicalUrl = `${baseUrl}/gift-guides/${guide.slug}`;
  const schema = JSON.stringify(buildGuideSchema(products, guide.title, guide.description, canonicalUrl)).replace(/</g, '\\u003c');

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: schema }}
      />

      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-2xl font-black tracking-tight">
            goose.gifts
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-zinc-600">
            {giftGuides.map((item) => (
              <Link
                key={item.slug}
                href={`/gift-guides/${item.slug}`}
                className={item.slug === guide.slug ? 'text-red-700' : 'hover:text-zinc-950'}
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
        <Link href="/" className="text-sm font-semibold text-red-700 hover:text-red-800">
          Funny gift catalog
        </Link>
        <div className="mt-4 max-w-3xl">
          <h1 className="text-4xl font-black tracking-tight text-zinc-950 sm:text-5xl">
            {guide.h1}
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-600 sm:text-lg">
            {guide.intro}
          </p>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white py-8 sm:py-10">
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
                Catalog picks
              </p>
              <h2 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">
                Real products for this search
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-zinc-600">
              Selected from active catalog items with images, affiliate URLs, and matching gift-guide signals.
            </p>
          </div>

          {products.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
              Catalog matches are thin for this guide today. More products will appear as daily discovery expands the catalog.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {products.map((product, index) => (
                <a
                  key={product.id}
                  href={product.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-[19rem] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-lg"
                >
                  <div className="aspect-square bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                      loading={index < 6 ? 'eager' : 'lazy'}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-zinc-950">{formatPrice(product)}</span>
                      <span className="shrink-0 text-zinc-500">{product.source === 'amazon' ? 'Amazon' : 'Etsy'}</span>
                    </div>
                    <h3 className="line-clamp-3 text-sm font-semibold leading-snug text-zinc-950 group-hover:text-red-700">
                      {product.punnyTitle || product.title}
                    </h3>
                    {(product.wittyDescription || product.sourceQuery) && (
                      <p className="line-clamp-2 text-xs leading-5 text-zinc-600">
                        {product.wittyDescription || product.sourceQuery}
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
