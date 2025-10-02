'use client';

import { useState } from 'react';
import { GiftRequestForm } from '@/components/GiftRequestForm';
import { GiftResults } from '@/components/GiftResults';
import type { GiftIdea, GiftRequest } from '@/lib/types';

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [giftIdeas, setGiftIdeas] = useState<GiftIdea[] | null>(null);
  const [permalinkUrl, setPermalinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (request: GiftRequest) => {
    setLoading(true);
    setError(null);
    setGiftIdeas(null);
    setPermalinkUrl(null);

    try {
      const response = await fetch('/api/generate-gift', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      // Handle preview mode (no API keys)
      if (data.needsApiKeys && data.concepts) {
        setError(
          `🎉 AI Generated ${data.concepts.length} Concepts!\n\n` +
          data.concepts.map((c: any, i: number) =>
            `${i + 1}. ${c.title}\n   "${c.tagline}"\n   ${c.description}\n   📦 Will search for: ${c.productSearchQueries.join(', ')}`
          ).join('\n\n') +
          '\n\n⚠️ Add Amazon/Etsy API keys to see actual products!'
        );
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate gifts');
      }

      setGiftIdeas(data.giftIdeas);
      setPermalinkUrl(data.permalinkUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl sm:text-7xl font-extrabold mb-4">
            <span className="gradient-text">goose.gifts</span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-700 mb-2">
            AI-Powered Funny Gift Finder
          </p>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Discover hilarious, pun-driven gift ideas powered by AI.
            Tell us about your recipient and we'll create funny, themed gift bundles just for them!
          </p>
        </div>

        {/* Main Content */}
        {!giftIdeas ? (
          <div className="max-w-2xl mx-auto">
            <GiftRequestForm onSubmit={handleSubmit} loading={loading} />

            {error && (
              <div className="mt-6 p-6 bg-white border-2 border-purple-300 rounded-lg shadow-lg">
                <pre className="text-gray-900 whitespace-pre-wrap text-base leading-relaxed">{error}</pre>
              </div>
            )}

            {loading && (
              <div className="mt-12 text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                <p className="text-lg text-gray-700 font-medium">
                  Creating hilarious gift ideas...
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  This may take 20-30 seconds while we search for the perfect products
                </p>
              </div>
            )}
          </div>
        ) : (
          <GiftResults
            giftIdeas={giftIdeas}
            permalinkUrl={permalinkUrl}
            onStartOver={() => {
              setGiftIdeas(null);
              setPermalinkUrl(null);
              setError(null);
            }}
          />
        )}
      </div>

      {/* How It Works Section */}
      {!giftIdeas && !loading && (
        <div className="container mx-auto px-4 py-16 max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-800">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-purple-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✍️</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-gray-900">1. Describe</h3>
              <p className="text-gray-700">
                Tell us about the recipient, the occasion, and your budget
              </p>
            </div>
            <div className="text-center">
              <div className="bg-pink-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🤖</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-gray-900">2. AI Magic</h3>
              <p className="text-gray-700">
                Our AI creates funny, punny gift concepts and finds real products
              </p>
            </div>
            <div className="text-center">
              <div className="bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎁</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-gray-900">3. Share & Buy</h3>
              <p className="text-gray-700">
                Get themed gift bundles with links to buy, plus a shareable link
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
