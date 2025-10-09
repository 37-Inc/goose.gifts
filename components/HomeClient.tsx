'use client';

import { useState } from 'react';
import { GiftRequestForm } from '@/components/GiftRequestForm';
import { GiftResults } from '@/components/GiftResults';
import { LoadingSteps } from '@/components/LoadingSteps';
import type { GiftIdea, GiftRequest } from '@/lib/types';
import type { GiftConcept } from '@/lib/openai';

export function HomeClient() {
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
    <>
      {!giftIdeas ? (
        <div className="max-w-2xl mx-auto mt-6">
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
    </>
  );
}
