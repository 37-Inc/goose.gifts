'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface SearchResult {
  id: string;
  slug: string;
  title: string;
  description: string;
  occasion: string | null;
  url: string;
  productImages: string[];
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search-bundles?q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();
        setResults(data.results || []);
        setIsOpen(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          window.open(results[selectedIndex].url, '_blank', 'noopener,noreferrer');
          setIsOpen(false);
          setQuery('');
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  const handleResultClick = (url: string) => {
    // Open in new tab for instant response (no wait for tracking)
    window.open(url, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={searchRef} className="relative w-full">
      {/* Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search gift bundles..."
          className="w-full px-4 py-2.5 pl-11 pr-4 text-sm bg-white border-2 border-zinc-200 rounded-lg focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
        />
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border-2 border-zinc-200 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          {results.map((result, index) => (
            <button
              key={result.id}
              onClick={() => handleResultClick(result.url)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-100 hover:bg-orange-50 transition-colors ${
                index === selectedIndex ? 'bg-orange-50' : ''
              } ${index === results.length - 1 ? 'border-b-0 rounded-b-lg' : ''}`}
            >
              <div className="flex items-start gap-3">
                {/* Bundle Image Grid (2x2) */}
                <div className="flex-shrink-0 w-16 h-16 bg-zinc-100 rounded-lg overflow-hidden">
                  {result.productImages.length > 0 ? (
                    <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5 bg-zinc-200 p-0.5">
                      {result.productImages.slice(0, 4).map((imageUrl, imgIndex) => (
                        <div key={imgIndex} className="relative bg-white overflow-hidden">
                          <Image
                            src={imageUrl}
                            alt=""
                            fill
                            className="object-cover scale-110"
                            sizes="32px"
                          />
                        </div>
                      ))}
                      {/* Fill empty slots if less than 4 images */}
                      {Array.from({ length: Math.max(0, 4 - result.productImages.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="bg-white"></div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center">
                      <span className="text-white text-xl">🎁</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-zinc-900 mb-0.5 truncate">
                    {result.title}
                  </div>
                  <div className="text-xs text-zinc-600 line-clamp-2">
                    {result.description}
                    {result.occasion && (
                      <span className="text-orange-600 font-medium">
                        {' '}• {result.occasion}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute z-50 w-full mt-2 bg-white border-2 border-zinc-200 rounded-lg shadow-xl p-4 text-center text-sm text-zinc-500">
          No bundles found. Try a different search or{' '}
          <button
            onClick={() => {
              setIsOpen(false);
              setQuery('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-orange-600 hover:text-orange-700 font-medium"
          >
            create a new one
          </button>
          !
        </div>
      )}
    </div>
  );
}
