import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { getGiftIdeasBySlug } from '@/lib/db';
import { GiftResults } from '@/components/GiftResults';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = await getGiftIdeasBySlug(slug);

  if (!record) {
    return {
      title: 'Gift Not Found - goose.gifts',
    };
  }

  const firstGiftTitle = record.gift_ideas[0]?.title || 'Funny Gift Ideas';

  return {
    title: `${firstGiftTitle} - goose.gifts`,
    description: `Check out these hilarious gift ideas: ${record.gift_ideas.map(g => g.title).join(', ')}`,
    openGraph: {
      title: `${firstGiftTitle} - goose.gifts`,
      description: `AI-generated funny gift ideas for: ${record.recipient_description.slice(0, 100)}...`,
      type: 'website',
    },
  };
}

export default async function PermalinkPage({ params }: PageProps) {
  const { slug } = await params;
  const record = await getGiftIdeasBySlug(slug);

  if (!record) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const permalinkUrl = `${baseUrl}/${slug}`;

  // Generate JSON-LD structured data for gift bundles
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Gift Ideas for ${record.recipient_description.slice(0, 100)}`,
    description: `AI-generated gift bundles: ${record.gift_ideas.map(g => g.title).join(', ')}`,
    numberOfItems: record.gift_ideas.length,
    itemListElement: record.gift_ideas.map((gift, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: gift.title,
        description: gift.tagline,
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'USD',
          lowPrice: Math.min(...gift.products.filter(p => p.price > 0).map(p => p.price)),
          highPrice: Math.max(...gift.products.filter(p => p.price > 0).map(p => p.price)),
          offerCount: gift.products.length,
        },
      },
    })),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      {/* JSON-LD Structured Data */}
      <Script
        id="gift-bundle-schema"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />

      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold">
              <span className="gradient-text">goose.gifts</span>
            </h1>
          </Link>
          <p className="text-gray-600">
            AI-Powered Funny Gift Finder
          </p>
        </div>

        {/* Context Card */}
        <div className="max-w-3xl mx-auto mb-8 bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Gift Ideas For:
          </h2>
          <p className="text-gray-700 mb-4">{record.recipient_description}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {record.occasion && (
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full">
                Occasion: {record.occasion}
              </span>
            )}
            <span className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full">
              Style: {record.humor_style}
            </span>
            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full">
              Budget: ${record.min_price} - ${record.max_price}
            </span>
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
              👁 {record.view_count} views
            </span>
          </div>
        </div>

        {/* Gift Ideas */}
        <GiftResults
          giftIdeas={record.gift_ideas}
          permalinkUrl={permalinkUrl}
          searchRequest={null}
          onStartOver={() => {
            // Client-side navigation handled by Link component
            window.location.href = '/';
          }}
        />

        {/* CTA */}
        <div className="max-w-2xl mx-auto mt-12 text-center">
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-8 text-white shadow-xl">
            <h3 className="text-2xl font-bold mb-3">
              Want Your Own Funny Gift Ideas?
            </h3>
            <p className="mb-6 opacity-90">
              Tell us about your recipient and we&apos;ll create hilarious, personalized gift bundles powered by AI
            </p>
            <Link
              href="/"
              className="inline-block bg-white text-purple-600 font-bold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Create Gift Ideas →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
