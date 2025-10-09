'use client';

import { useState } from 'react';
import type { GiftRequest, HumorStyle } from '@/lib/types';

interface GiftRequestFormProps {
  onSubmit: (request: GiftRequest) => void;
  loading: boolean;
}

export function GiftRequestForm({ onSubmit, loading }: GiftRequestFormProps) {
  const [recipientDescription, setRecipientDescription] = useState('');
  const [occasion, setOccasion] = useState('');
  const [humorStyle, setHumorStyle] = useState<HumorStyle>('pg');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (recipientDescription.trim().length < 5) {
      alert('Please provide at least a few words about the recipient');
      return;
    }

    if (recipientDescription.trim().length > 2000) {
      alert('Description is too long (max 2000 characters)');
      return;
    }

    // Track search with Google Analytics (standard GA4 search event)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gtag = (window as any).gtag;

      console.log('[GA4] Sending search event', {
        term: recipientDescription.trim(),
        occasion: occasion.trim() || undefined,
        humorStyle,
      });

      gtag('event', 'search', {
        search_term: recipientDescription.trim(),
        search_occasion: occasion.trim() || undefined,
        search_humor_style: humorStyle,
      });

      console.log('[GA4] Search event tracked successfully');
    } else {
      console.log('[GA4] gtag not available, skipping search tracking');
    }

    onSubmit({
      recipientDescription: recipientDescription.trim(),
      occasion: occasion.trim() || undefined,
      humorStyle,
      minPrice: 0,
      maxPrice: 10000,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-100 shadow-sm p-6 card-hover">
      {/* Recipient Description */}
      <div className="mb-4">
        <label htmlFor="recipient" className="block text-sm font-light text-zinc-700 mb-2">
          Generate a gift bundle
        </label>
        <textarea
          id="recipient"
          value={recipientDescription}
          onChange={(e) => setRecipientDescription(e.target.value)}
          placeholder="Loves cats, dad jokes, and craft beer. Works from home."
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 resize-none placeholder:text-zinc-400 text-zinc-900 text-sm font-light"
          rows={3}
          required
          disabled={loading}
        />
      </div>

      {/* Additional Options Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-600 mb-4 transition-colors font-light"
        disabled={loading}
      >
        <svg
          className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>Additional options</span>
      </button>

      {/* Collapsible Advanced Options */}
      {showAdvanced && (
        <div className="space-y-4 mb-4 pb-4 border-b border-zinc-100">
          {/* Occasion (Optional) */}
          <div>
            <label htmlFor="occasion" className="block text-sm font-light text-zinc-700 mb-2">
              Occasion <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              id="occasion"
              type="text"
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              placeholder="Birthday, Anniversary, Just because..."
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 placeholder:text-zinc-400 text-zinc-900 text-sm font-light"
              disabled={loading}
            />
          </div>

          {/* Humor Style */}
          <div>
            <label className="block text-sm font-light text-zinc-700 mb-2">
              Humor style
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'pg', emoji: '👶', label: 'PG', desc: 'All-ages fun' },
                { value: 'dad-joke', emoji: '😄', label: 'Dad Joke', desc: 'Wholesome & punny' },
                { value: 'office-safe', emoji: '💼', label: 'Office-Safe', desc: 'Professional wit' },
                { value: 'edgy', emoji: '🔥', label: 'Edgy', desc: 'Bold & sarcastic' },
              ].map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => setHumorStyle(style.value as HumorStyle)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    humorStyle === style.value
                      ? 'border-[#f59e42] bg-[#f59e42] text-white selected-check pop-animation'
                      : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                  disabled={loading}
                >
                  <div className={`flex items-center gap-2 mb-1`}>
                    <span className="text-base">{style.emoji}</span>
                    <span className={`font-light text-xs ${humorStyle === style.value ? 'text-white' : 'text-zinc-900'}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className={`text-[10px] font-light ${humorStyle === style.value ? 'text-orange-100' : 'text-zinc-500'} pl-6`}>
                    {style.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || recipientDescription.trim().length < 5}
        className="w-full accent-gradient text-white font-light py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md disabled:shadow-none"
      >
        {loading ? 'Generating...' : 'Find gifts →'}
      </button>
    </form>
  );
}
