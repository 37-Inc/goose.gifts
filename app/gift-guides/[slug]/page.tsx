import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/ProductGrid';
import { Header } from '@/components/Header';
import { PageHero } from '@/components/ui/PageHero';
import { SectionHeading, BrowseCard } from '@/components/ui/SectionHeading';
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
    <main className="min-h-screen bg-white text-zinc-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: schema }}
      />

      <Header />

      <PageHero title={guide.h1} subtitle={guide.intro} />

      <nav
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 px-4 pt-5"
        aria-label="Related gift guides"
      >
        {navGuides.map((item) => (
          <Link
            key={item.slug}
            href={`/gift-guides/${item.slug}`}
            className={
              item.slug === guide.slug
                ? 'rounded-full bg-zinc-950 px-3.5 py-1.5 text-[13px] font-semibold text-white'
                : 'rounded-full bg-zinc-100 px-3.5 py-1.5 text-[13px] font-medium text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950'
            }
          >
            {item.title}
          </Link>
        ))}
      </nav>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:pt-14">
        <SectionHeading title="Hand-picked from the catalog" aside="Real products, live prices" />

        {products.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 px-6 py-16 text-center text-sm leading-6 text-zinc-500">
            Catalog matches are thin for this guide today. More products will appear as
            daily discovery expands the catalog.
          </div>
        ) : (
          <ProductGrid
            products={products}
            clickSource="gift_guide"
            contextSlug={guide.slug}
          />
        )}
      </section>

      <section className="mx-auto grid max-w-6xl gap-x-10 gap-y-12 px-4 pb-20 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
        <div>
          <SectionHeading title="What to know before picking one" />
          <div className="divide-y divide-zinc-100">
            {faqs.map((faq) => (
              <div key={faq.question} className="py-5 first:pt-0">
                <h3 className="text-base font-semibold text-zinc-900">
                  {faq.question}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>

        <aside>
          <SectionHeading title="Keep browsing" />
          <div className="flex flex-col gap-2">
            {relatedGuides.map((item) => (
              <BrowseCard
                key={item.slug}
                href={`/gift-guides/${item.slug}`}
                title={item.title}
              />
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
