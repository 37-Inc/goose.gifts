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

    if (recipientDescription.trim().length < 5) {
      alert('Please provide at least a few words about the recipient');
      return;
    }

    if (recipientDescription.trim().length > 2000) {
      alert('Description is too long (max 2000 characters)');
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
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-200 p-8 card-hover">
      {/* Recipient Description */}
      <div className="mb-6">
        <label htmlFor="recipient" className="block text-sm font-medium text-zinc-900 mb-2">
          About the recipient
        </label>
        <textarea
          id="recipient"
          value={recipientDescription}
          onChange={(e) => setRecipientDescription(e.target.value)}
          placeholder="Loves cats, craft beer, makes dad jokes all day..."
          className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 resize-none placeholder:text-zinc-400 text-zinc-900 text-sm"
          rows={4}
          required
          disabled={loading}
        />
        <p className="text-xs text-zinc-500 mt-1.5">
          More details = better results
        </p>
      </div>

      {/* Occasion (Optional) */}
      <div className="mb-6">
        <label htmlFor="occasion" className="block text-sm font-medium text-zinc-900 mb-2">
          Occasion <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <input
          id="occasion"
          type="text"
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          placeholder="Birthday, Anniversary, Just because..."
          className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 placeholder:text-zinc-400 text-zinc-900 text-sm"
          disabled={loading}
        />
      </div>

      {/* Humor Style */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-900 mb-3">
          Humor style
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
              className={`p-3 rounded-lg border text-left transition-all ${
                humorStyle === style.value
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
              disabled={loading}
            >
              <div className={`font-medium text-sm ${humorStyle === style.value ? 'text-white' : 'text-zinc-900'}`}>
                {style.label}
              </div>
              <div className={`text-xs mt-0.5 ${humorStyle === style.value ? 'text-zinc-300' : 'text-zinc-500'}`}>
                {style.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Budget Range */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-zinc-900 mb-3">
          Budget per bundle
        </label>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
              <input
                id="minPrice"
                type="number"
                min="0"
                max="10000"
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                className="w-full pl-8 pr-3 py-2.5 border border-zinc-200 rounded-lg focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-zinc-900 text-sm"
                disabled={loading}
              />
            </div>
          </div>
          <div className="text-zinc-300">→</div>
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
              <input
                id="maxPrice"
                type="number"
                min="0"
                max="10000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full pl-8 pr-3 py-2.5 border border-zinc-200 rounded-lg focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-zinc-900 text-sm"
                disabled={loading}
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Total for 2-4 products
        </p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || recipientDescription.trim().length < 5}
        className="w-full accent-gradient text-white font-medium py-3.5 px-8 rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {loading ? 'Generating...' : 'Find gifts →'}
      </button>
    </form>
  );
}
