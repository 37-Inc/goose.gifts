'use client';

import { useEffect, useRef, useState } from 'react';
import type { Product, ProductSearchResult } from '@/lib/types';
import { ProductGrid } from './ProductGrid';

interface CatalogSearchFeedProps {
  initialProducts: Product[];
  initialQuery?: string;
}

interface ProductSearchResponse {
  results?: ProductSearchResult[];
  searchId?: string | null;
  error?: string;
}

type Gtag = (command: 'event', eventName: string, params: Record<string, unknown>) => void;

function getGtag(): Gtag | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return (window as Window & { gtag?: Gtag }).gtag;
}

function updateSearchUrl(query: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);

  if (query) {
    url.searchParams.set('q', query);
  } else {
    url.searchParams.delete('q');
  }

  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export function CatalogSearchFeed({
  initialProducts,
  initialQuery = '',
}: CatalogSearchFeedProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery.trim());
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestedQueryRef = useRef<string | null>(null);

  const runSearch = async (value: string, options: { force?: boolean } = {}) => {
    const trimmed = value.trim();

    if (trimmed.length < 2) {
      requestIdRef.current += 1;
      lastRequestedQueryRef.current = null;
      setActiveQuery('');
      setProducts(initialProducts);
      setSearchId(null);
      setIsLoading(false);
      setError(null);
      updateSearchUrl('');
      return;
    }

    if (!options.force && trimmed === lastRequestedQueryRef.current) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    lastRequestedQueryRef.current = trimmed;
    setIsLoading(true);
    setError(null);
    updateSearchUrl(trimmed);

    try {
      const response = await fetch(`/api/search-products?q=${encodeURIComponent(trimmed)}&limit=36`);
      const data = (await response.json()) as ProductSearchResponse;

      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      setActiveQuery(trimmed);
      setProducts(data.results ?? []);
      setSearchId(data.searchId || null);

      const gtag = getGtag();
      if (gtag) {
        gtag('event', 'search', {
          search_term: trimmed,
          event_category: 'catalog_search',
          event_label: `${data.results?.length ?? 0} products`,
        });
      }
    } catch (searchError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(searchError instanceof Error ? searchError.message : 'Search failed');
      setProducts([]);
      setSearchId(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch(query);
    }, 450);

    return () => clearTimeout(timer);
    // initialProducts is intentionally stable from the server render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hasSearch = activeQuery.length >= 2;

  return (
    <section id="catalog-search" className="scroll-mt-4 border-y border-zinc-200 bg-white py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-3 sm:px-4">
        <div className="mb-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
              {hasSearch ? 'Best Matches' : 'Fresh Finds'}
            </p>
            <h2 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">
              {hasSearch ? `Gifts for "${activeQuery}"` : 'Ridiculous Gifts Worth Buying'}
            </h2>
          </div>

          <form
            className="w-full lg:max-w-xl"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch(query, { force: true });
            }}
          >
            <label htmlFor="catalog-search-input" className="sr-only">
              Search gifts
            </label>
            <div className="relative">
              <input
                id="catalog-search-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="dad with no spare time"
                className="h-12 w-full rounded-lg border-2 border-zinc-200 bg-white pl-11 pr-24 text-base text-zinc-950 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
              <svg
                className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Search
              </button>
            </div>
          </form>
        </div>

        {isLoading && (
          <div className="mb-4 text-sm font-medium text-zinc-500">
            Searching catalog...
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!isLoading && products.length === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
            No strong matches yet. This search is now logged as a catalog gap.
          </div>
        )}

        <ProductGrid
          products={products}
          clickSource={hasSearch ? 'catalog_search' : 'catalog_home'}
          searchQueryId={searchId}
        />
      </div>
    </section>
  );
}
