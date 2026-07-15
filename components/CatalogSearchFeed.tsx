'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product, ProductSearchResult } from '@/lib/types';
import { ProductGrid } from './ProductGrid';

interface CatalogSearchFeedProps {
  initialProducts: Product[];
  initialQuery?: string;
  feedSeed: string;
  featuredGuides: Array<{ slug: string; title: string }>;
}

interface ProductSearchResponse {
  results?: ProductSearchResult[];
  searchId?: string | null;
  error?: string;
}

interface CatalogFeedResponse {
  products?: Product[];
  hasMore?: boolean;
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
  feedSeed,
  featuredGuides,
}: CatalogSearchFeedProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery.trim());
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialQuery.trim().length < 2);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestedQueryRef = useRef<string | null>(null);
  const feedRequestIdRef = useRef(0);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreInFlightRef = useRef(false);

  const runSearch = async (value: string, options: { force?: boolean } = {}) => {
    const trimmed = value.trim();

    if (trimmed.length < 2) {
      requestIdRef.current += 1;
      feedRequestIdRef.current += 1;
      loadMoreInFlightRef.current = false;
      lastRequestedQueryRef.current = null;
      setActiveQuery('');
      setProducts(initialProducts);
      setSearchId(null);
      setHasMore(true);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      updateSearchUrl('');
      return;
    }

    if (!options.force && trimmed === lastRequestedQueryRef.current) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    feedRequestIdRef.current += 1;
    loadMoreInFlightRef.current = false;
    lastRequestedQueryRef.current = trimmed;
    setIsLoading(true);
    setIsLoadingMore(false);
    setHasMore(false);
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
      setHasMore(false);

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
      setHasMore(false);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    // A shared ?q= URL is already server-rendered, but this one intentional
    // request records the complete query and supplies a search ID for clicks.
    if (initialQuery.trim().length >= 2) {
      runSearch(initialQuery);
    }
    // Only hydrate the server-provided query once; subsequent searches submit
    // through the form instead of logging every intermediate keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasSearch = activeQuery.length >= 2;

  const loadMore = useCallback(async () => {
    if (hasSearch || loadMoreInFlightRef.current || !hasMore) {
      return;
    }

    loadMoreInFlightRef.current = true;
    const feedRequestId = feedRequestIdRef.current + 1;
    feedRequestIdRef.current = feedRequestId;
    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await fetch('/api/catalog-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: feedSeed,
          limit: 24,
          excludeIds: products.map((product) => product.id),
        }),
      });
      const data = (await response.json()) as CatalogFeedResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Could not load more gifts');
      }

      if (feedRequestId !== feedRequestIdRef.current) {
        return;
      }

      const existingIds = new Set(products.map((product) => product.id));
      const additions = (data.products ?? []).filter((product) => !existingIds.has(product.id));
      setProducts((current) => [...current, ...additions]);
      setHasMore(Boolean(data.hasMore) && additions.length > 0);
    } catch (loadError) {
      if (feedRequestId === feedRequestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load more gifts');
      }
    } finally {
      if (feedRequestId === feedRequestIdRef.current) {
        loadMoreInFlightRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [feedSeed, hasMore, hasSearch, products]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || hasSearch || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: '500px 0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, hasSearch, loadMore]);

  return (
    <section id="catalog-search" className="scroll-mt-4 bg-white">
      <div className="mx-auto max-w-7xl px-4 pb-7">
        <form
          className="max-w-3xl"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(query, { force: true });
          }}
        >
          <label htmlFor="catalog-search-input" className="mb-2 block text-sm font-bold text-zinc-950">
            Search thousands of weird gifts
          </label>
          <div className="relative">
            <input
              id="catalog-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “coworker who loves cats”"
              className="h-14 w-full rounded-xl border-2 border-zinc-300 bg-white pl-12 pr-28 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-red-500 focus:ring-4 focus:ring-red-100 sm:text-lg"
            />
            <svg
              className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <button
              type="submit"
              disabled={isLoading}
              className="absolute right-1.5 top-1/2 h-11 -translate-y-1/2 rounded-lg bg-zinc-950 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-70"
            >
              {isLoading ? 'Searching' : 'Search'}
            </button>
          </div>
        </form>

        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Popular gift guides">
          {featuredGuides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/gift-guides/${guide.slug}`}
              className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-500 hover:bg-white hover:text-zinc-950"
            >
              {guide.title}
            </Link>
          ))}
          <Link
            href="/gift-guides"
            className="rounded-full border border-zinc-950 bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            All guides
          </Link>
        </nav>
      </div>

      <div className="border-y border-zinc-200 py-8 sm:py-10">
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
              {hasSearch ? 'Best Matches' : 'Fresh Finds'}
            </p>
            <h2 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">
              {hasSearch ? `Gifts for "${activeQuery}"` : 'Ridiculous Gifts Worth Buying'}
            </h2>
          </div>
          {hasSearch && (
            <button
              type="button"
              onClick={() => {
                if (initialQuery.trim().length >= 2) {
                  window.location.assign('/');
                  return;
                }
                setQuery('');
                runSearch('');
              }}
              className="shrink-0 text-sm font-semibold text-zinc-600 underline-offset-4 hover:text-red-700 hover:underline"
            >
              Clear search
            </button>
          )}
        </div>

        {isLoading && (
          <div className="mb-4 text-sm font-medium text-zinc-500" role="status" aria-live="polite">
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

        {!hasSearch && products.length > 0 && (
          <div className="mt-8 flex flex-col items-center gap-3">
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="min-w-40 rounded-lg border-2 border-zinc-950 bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-950 hover:text-white disabled:cursor-wait disabled:opacity-60"
              >
                {isLoadingMore ? 'Loading more…' : 'Load more gifts'}
              </button>
            ) : (
              <p className="text-sm font-medium text-zinc-500">You reached the end of the good stuff.</p>
            )}
            <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />
          </div>
        )}
        </div>
      </div>
    </section>
  );
}
