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
  const [humorStyle, setHumorStyle] = useState<HumorStyle>('dad-joke');
  const [minPrice, setMinPrice] = useState(10);
  const [maxPrice, setMaxPrice] = useState(50);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (recipientDescription.trim().length < 10) {
      alert('Please provide more details about the recipient (at least 10 characters)');
      return;
    }

    onSubmit({
      recipientDescription: recipientDescription.trim(),
      occasion: occasion.trim() || undefined,
      humorStyle,
      minPrice,
      maxPrice,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8">
      {/* Recipient Description */}
      <div className="mb-6">
        <label htmlFor="recipient" className="block text-sm font-semibold text-gray-700 mb-2">
          Tell us about the recipient *
        </label>
        <textarea
          id="recipient"
          value={recipientDescription}
          onChange={(e) => setRecipientDescription(e.target.value)}
          placeholder="e.g., My coworker is leaving for a new job. He loves cats and craft beer. He's always making dad jokes in meetings."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          rows={4}
          required
          disabled={loading}
        />
        <p className="text-xs text-gray-500 mt-1">
          The more details, the better! Mention hobbies, interests, personality traits, etc.
        </p>
      </div>

      {/* Occasion (Optional) */}
      <div className="mb-6">
        <label htmlFor="occasion" className="block text-sm font-semibold text-gray-700 mb-2">
          Occasion (optional)
        </label>
        <input
          id="occasion"
          type="text"
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          placeholder="e.g., Farewell party, Birthday, Secret Santa"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          disabled={loading}
        />
      </div>

      {/* Humor Style */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Humor Style
        </label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'dad-joke', label: '😄 Dad Joke', desc: 'Wholesome & punny' },
            { value: 'office-safe', label: '💼 Office-Safe', desc: 'Professional wit' },
            { value: 'edgy', label: '🔥 Edgy', desc: 'Bold & sarcastic' },
            { value: 'pg', label: '👶 PG', desc: 'All-ages fun' },
          ].map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => setHumorStyle(style.value as HumorStyle)}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                humorStyle === style.value
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              disabled={loading}
            >
              <div className="font-medium text-sm">{style.label}</div>
              <div className="text-xs text-gray-500 mt-1">{style.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Budget Range */}
      <div className="mb-8">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Budget Range
        </label>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label htmlFor="minPrice" className="block text-xs text-gray-600 mb-1">
              Min Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                id="minPrice"
                type="number"
                min="5"
                max="1000"
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>
          <div className="pt-6 text-gray-400">—</div>
          <div className="flex-1">
            <label htmlFor="maxPrice" className="block text-xs text-gray-600 mb-1">
              Max Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                id="maxPrice"
                type="number"
                min="10"
                max="1000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Budget per gift bundle (includes 2-4 products)
        </p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || recipientDescription.trim().length < 10}
        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-4 px-8 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
      >
        {loading ? 'Generating Gifts...' : '🎁 Find Funny Gifts'}
      </button>
    </form>
  );
}
