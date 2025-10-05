'use client';

import { useState } from 'react';
import { GiftRequestForm } from '@/components/GiftRequestForm';
import { GiftResults } from '@/components/GiftResults';
import { LoadingSteps } from '@/components/LoadingSteps';
import type { GiftIdea, GiftRequest } from '@/lib/types';
import type { GiftConcept } from '@/lib/openai';

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [giftIdeas, setGiftIdeas] = useState<GiftIdea[] | null>(null);
  const [permalinkUrl, setPermalinkUrl] = useState<string | null>(null);
  const [searchRequest, setSearchRequest] = useState<GiftRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (request: GiftRequest) => {
    setLoading(true);
    setError(null);
    setGiftIdeas(null);
    setPermalinkUrl(null);
    setSearchRequest(request);

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
          data.concepts.map((c: GiftConcept, i: number) =>
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
    <div className="min-h-screen warm-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <div className="text-center mb-16">
          {/* Logo + Title - stacked on mobile, inline on desktop */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mb-6">
            <button
              onClick={() => {
                setGiftIdeas(null);
                setPermalinkUrl(null);
                setSearchRequest(null);
                setError(null);
              }}
              className="transition-transform hover:scale-105 active:scale-95"
              aria-label="Go to homepage"
            >
              <img
                src="/sillygoose.png"
                alt="Silly Goose"
                className="w-24 h-24 sm:w-32 sm:h-32 sm:translate-y-3"
              />
            </button>
            <h1 className="text-6xl sm:text-8xl font-bold tracking-tight text-zinc-900">
              goose.gifts
            </h1>
          </div>
          <p className="text-lg sm:text-xl text-zinc-600 mb-3 font-medium">
            Gift like a silly goose!
          </p>
          <p className="text-zinc-500 max-w-2xl mx-auto text-sm sm:text-base">
            Smart, funny gift ideas in seconds. Tell us about them, we&apos;ll find the perfect&nbsp;match.
          </p>
        </div>

        {/* Main Content */}
        {!giftIdeas ? (
          <div className="max-w-2xl mx-auto mt-12">
            <GiftRequestForm onSubmit={handleSubmit} loading={loading} />

            {error && (
              <div className="mt-6 p-6 bg-white border-2 border-purple-300 rounded-lg shadow-lg">
                <pre className="text-gray-900 whitespace-pre-wrap text-base leading-relaxed">{error}</pre>
              </div>
            )}

            {loading && (
              <div className="mt-16">
                <LoadingSteps recipientDescription={searchRequest?.recipientDescription} />
              </div>
            )}
          </div>
        ) : (
          <GiftResults
            giftIdeas={giftIdeas}
            permalinkUrl={permalinkUrl}
            searchRequest={searchRequest}
            onStartOver={() => {
              setGiftIdeas(null);
              setPermalinkUrl(null);
              setSearchRequest(null);
              setError(null);
            }}
          />
        )}
      </div>

      {/* How It Works Section */}
      {!giftIdeas && !loading && (
        <div className="container mx-auto px-4 py-24 max-w-2xl">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="text-zinc-900 text-sm font-semibold mb-2">01</div>
              <h3 className="text-lg font-semibold mb-2 text-zinc-900">Describe</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Tell us about them - interests, personality, the occasion
              </p>
            </div>
            <div>
              <div className="text-zinc-900 text-sm font-semibold mb-2">02</div>
              <h3 className="text-lg font-semibold mb-2 text-zinc-900">Generate</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                AI creates clever gift concepts with real products
              </p>
            </div>
            <div>
              <div className="text-zinc-900 text-sm font-semibold mb-2">03</div>
              <h3 className="text-lg font-semibold mb-2 text-zinc-900">Share</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Get curated bundles with links, ready to buy or share
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      {!giftIdeas && !loading && (
        <div className="text-center py-12">
          <p className="text-xs text-zinc-400">
            Made with 🪿 by silly humans
          </p>
        </div>
      )}
    </div>
  );
}
