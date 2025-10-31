import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { getGiftBundleBySlug } from '@/lib/db/operations';
import { findRelatedBundles, getNewestBundles } from '@/lib/db/related-bundles';
import { ProductCarousel } from '@/components/ProductCarousel';
import { FAQAccordion } from '@/components/FAQAccordion';
import { SocialShareButtons } from '@/components/SocialShareButtons';
import { Header } from '@/components/Header';

interface BundlePageProps {
  params: Promise<{ slug: string }>;
}

// ISR: Revalidate every 24 hours
export const revalidate = 86400;

// Generate metadata for SEO
export async function generateMetadata({ params }: BundlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getGiftBundleBySlug(slug);

  if (!bundle) {
    return {
      title: 'Gift Bundle Not Found',
      description: "The gift bundle you're looking for doesn't exist.",
    };
  }

  const url = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://goose.gifts'}/${slug}`;

  return {
    title: bundle.seoTitle || bundle.giftIdeas[0]?.title || 'Gift Bundle',
    description: bundle.seoDescription || bundle.recipientDescription,
    keywords: bundle.seoKeywords || undefined,
    openGraph: {
      title: bundle.seoTitle || bundle.giftIdeas[0]?.title || 'Gift Bundle',
      description: bundle.seoDescription || bundle.recipientDescription,
      url,
      siteName: 'goose.gifts',
      type: 'website',
      images: bundle.giftIdeas[0]?.products[0]?.imageUrl
        ? [{ url: bundle.giftIdeas[0].products[0].imageUrl }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: bundle.seoTitle || bundle.giftIdeas[0]?.title || 'Gift Bundle',
      description: bundle.seoDescription || bundle.recipientDescription,
      images: bundle.giftIdeas[0]?.products[0]?.imageUrl
        ? [bundle.giftIdeas[0].products[0].imageUrl]
        : [],
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function BundlePage({ params }: BundlePageProps) {
  const { slug } = await params;
  const bundle = await getGiftBundleBySlug(slug);

  if (!bundle) {
    notFound();
  }

  // Get related bundles (fallback to newest if not enough related)
  let relatedBundles = await findRelatedBundles(bundle.id, 4);
  if (relatedBundles.length < 4) {
    const newest = await getNewestBundles(4 - relatedBundles.length);
    // Filter out duplicates by ID
    const existingIds = new Set(relatedBundles.map(b => b.id));
    const uniqueNewest = newest.filter(b => !existingIds.has(b.id));
    relatedBundles = [...relatedBundles, ...uniqueNewest];
  }

  const url = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://goose.gifts'}/${slug}`;

  // Schema.org structured data for ProductCollection
  const productCollectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'ProductCollection',
    name: bundle.seoTitle || bundle.giftIdeas[0]?.title || 'Gift Bundle',
    description: bundle.seoDescription || bundle.recipientDescription,
    url,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: bundle.minPrice,
      highPrice: bundle.maxPrice,
      offerCount: bundle.giftIdeas.reduce((sum, idea) => sum + idea.products.length, 0),
    },
  };

  // Schema.org structured data for FAQ
  const faqSchema = bundle.seoFaqJson ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: bundle.seoFaqJson.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  } : null;

  return (
    <>
      {/* Structured Data */}
      <Script
        id="product-collection-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productCollectionSchema) }}
      />
      {faqSchema && (
        <Script
          id="faq-schema"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <div className="min-h-screen bg-zinc-50">
        {/* Header */}
        <Header />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Page Title */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-zinc-900 mb-3">
              {bundle.seoTitle || 'Gift Ideas'}
            </h1>
            <p className="text-lg text-zinc-600">
              {bundle.seoDescription || bundle.recipientDescription}
            </p>
          </div>

          {/* Social Sharing */}
          <div className="mb-12 pb-8 border-b border-zinc-200">
            <SocialShareButtons
              url={url}
              title={bundle.seoTitle || bundle.giftIdeas[0]?.title || 'Gift Bundle'}
              description={bundle.seoDescription || bundle.recipientDescription}
              slug={slug}
            />
          </div>

          {/* SEO Content */}
          {bundle.seoContent && (
            <div className="mb-20">
              <div className="bg-gradient-to-br from-white to-zinc-50 rounded-2xl p-10 shadow-sm border border-zinc-100">
                <div className="prose prose-lg prose-zinc max-w-none">
                  <div
                    className="text-zinc-700 leading-relaxed [&>p]:mb-5 [&>p:first-child]:text-xl [&>p:first-child]:text-zinc-800 [&>p:first-child]:font-medium"
                    style={{ whiteSpace: 'pre-line' }}
                  >
                    {bundle.seoContent}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Gift Bundles */}
          <div className="space-y-20 mb-20">
            {bundle.giftIdeas.map((giftIdea, index) => (
              <div key={giftIdea.id} className="group">
                {/* Gift Header */}
                <div className="mb-10 max-w-3xl">
                  <div className="flex items-baseline gap-4 mb-4">
                    <span className="text-xs font-semibold text-zinc-400 tracking-widest">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h2 className="text-3xl font-bold text-zinc-900 tracking-tight">
                      {giftIdea.title}
                    </h2>
                  </div>
                  <p className="text-lg text-zinc-500 italic ml-11 mb-4 font-light">
                    &quot;{giftIdea.tagline}&quot;
                  </p>
                  <p className="text-sm text-zinc-600 ml-11 leading-relaxed max-w-2xl">
                    {giftIdea.description}
                  </p>
                </div>

                {/* Products Carousel */}
                <ProductCarousel products={giftIdea.products} bundleSlug={slug} />

                {/* Bundle Total */}
                {giftIdea.products.some(p => p.price > 0) && (
                  <div className="mt-8 pt-6 border-t border-zinc-200">
                    <div className="flex items-center justify-between max-w-xs ml-11">
                      <span className="text-sm text-zinc-600">Bundle total</span>
                      <span className="text-xl font-semibold text-zinc-900">
                        ${giftIdea.products.reduce((sum, p) => sum + p.price, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* FAQ Section */}
          {bundle.seoFaqJson && bundle.seoFaqJson.length > 0 && (
            <div className="mb-20">
              <h2 className="text-2xl font-bold text-zinc-900 mb-6">Frequently Asked Questions</h2>
              <FAQAccordion faqs={bundle.seoFaqJson} />
            </div>
          )}

          {/* Related Bundles */}
          {relatedBundles.length > 0 && (
            <div className="mb-20">
              <h2 className="text-2xl font-bold text-zinc-900 mb-6">Similar Gift Ideas</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {relatedBundles.map((relatedBundle) => (
                  <Link
                    key={relatedBundle.id}
                    href={`/${relatedBundle.slug}`}
                    className="group block bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
                  >
                    {/* First product image as thumbnail */}
                    {relatedBundle.giftIdeas[0]?.products[0]?.imageUrl && (
                      <div className="relative mb-4 bg-zinc-50 rounded-lg overflow-hidden" style={{ aspectRatio: '1.91/1' }}>
                        <Image
                          src={relatedBundle.giftIdeas[0].products[0].imageUrl}
                          alt={relatedBundle.giftIdeas[0].title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          sizes="(max-width: 640px) 50vw, 33vw"
                          unoptimized
                        />
                      </div>
                    )}
                    <h3 className="text-lg font-semibold text-zinc-900 mb-2 line-clamp-2">
                      {relatedBundle.seoTitle || relatedBundle.giftIdeas[0]?.title}
                    </h3>
                    <p className="text-sm text-zinc-600 line-clamp-2">
                      {relatedBundle.seoDescription || relatedBundle.recipientDescription}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* CTA to Homepage */}
          <div className="text-center py-16 bg-gradient-to-br from-zinc-100 to-zinc-50 rounded-2xl">
            <h2 className="text-2xl font-bold text-zinc-900 mb-3">
              Create Your Own Gift Bundle
            </h2>
            <p className="text-zinc-600 mb-6 max-w-md mx-auto">
              Didn&apos;t find what you&apos;re looking for? Generate custom AI-powered gift ideas in seconds!
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Generate Gift Ideas
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-200 bg-white mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <p className="text-xs text-zinc-400 text-center">
              Prices shown are estimates and may vary. Click through to verify current pricing and availability.
              As affiliates, we may earn from qualifying purchases.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
