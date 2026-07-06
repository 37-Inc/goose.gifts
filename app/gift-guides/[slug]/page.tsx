import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/ProductGrid';
import { giftGuides, getFeaturedGiftGuides, getGiftGuide, getGiftGuideProducts } from '@/lib/gift-guides';
import { getSiteUrl } from '@/lib/site';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface GiftGuidePageProps {
  params: Promise<{ slug: string }>;
}

function buildGuideFaqs(guide: NonNullable<ReturnType<typeof getGiftGuide>>) {
  const title = guide.title.toLowerCase();

  return [
    {
      question: `What makes a good ${title}?`,
      answer: `${guide.intro} Look for a gift with a clear joke, a real use case, and enough specificity that it feels chosen for the recipient.`,
    },
    {
      question: `Are the ${title} on goose.gifts real products?`,
      answer: 'Yes. goose.gifts uses active catalog items with product images and outbound affiliate links. Some products show Check price because the retailer has the current price.',
    },
    {
      question: `How often is this ${title} page updated?`,
      answer: 'The page is backed by the live goose.gifts catalog. Products can change as discovery, enrichment, engagement, and product-quality checks update the catalog.',
    },
  ];
}

function getRelatedGuides(guide: NonNullable<ReturnType<typeof getGiftGuide>>) {
  const guideKeywords = new Set(guide.keywords);

  return giftGuides
    .filter((candidate) => candidate.slug !== guide.slug)
    .map((candidate) => ({
      guide: candidate,
      score: candidate.keywords.reduce(
        (total, keyword) => total + (guideKeywords.has(keyword) ? 1 : 0),
        0
      ),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.guide.title.localeCompare(b.guide.title);
    })
    .slice(0, 8)
    .map(({ guide: candidate }) => candidate);
}

function buildGuideSchema(
  products: Product[],
  guide: NonNullable<ReturnType<typeof getGiftGuide>>,
  url: string
) {
  const faqs = buildGuideFaqs(guide);

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
          url: getSiteUrl(),
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
            item: getSiteUrl(),
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
  const baseUrl = getSiteUrl();
  const canonicalUrl = `${baseUrl}/gift-guides/${guide.slug}`;
  const faqs = buildGuideFaqs(guide);
  const relatedGuides = getRelatedGuides(guide);
  const navGuides = getFeaturedGiftGuides(guide.slug, 10);
  const schema = JSON.stringify(buildGuideSchema(products, guide, canonicalUrl)).replace(/</g, '\\u003c');

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
            {navGuides.map((item) => (
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
            <ProductGrid
              products={products}
              clickSource="gift_guide"
              contextSlug={guide.slug}
            />
          )}
        </div>
      </section>

      <section className="bg-zinc-50 py-8 sm:py-10">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
              Quick answers
            </p>
            <h2 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">
              What to know before picking one
            </h2>
            <div className="mt-5 divide-y divide-zinc-200 border-y border-zinc-200">
              {faqs.map((faq) => (
                <div key={faq.question} className="py-5">
                  <h3 className="text-base font-bold text-zinc-950">
                    {faq.question}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <aside>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
              Related searches
            </p>
            <h2 className="mt-1 text-xl font-bold text-zinc-950">
              Keep browsing
            </h2>
            <div className="mt-4 flex flex-col gap-2">
              {relatedGuides.map((item) => (
                <Link
                  key={item.slug}
                  href={`/gift-guides/${item.slug}`}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:text-red-700"
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
