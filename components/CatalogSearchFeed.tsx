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
    <section id="catalog-search" className="scroll-mt-4">
      <div className="mx-auto max-w-2xl px-4 pt-7 sm:pt-8">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runSearch(query, { force: true });
          }}
        >
          <div className="relative">
            <input
              id="catalog-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “coworker who loves cats”"
              aria-label="Search thousands of weird gifts"
              className="h-14 w-full rounded-full border border-zinc-200 bg-white pl-5 pr-24 text-base text-zinc-950 shadow-[0_2px_16px_-4px_rgba(0,0,0,0.1)] outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)] sm:pl-12 sm:pr-28"
            />
            <svg
              className="pointer-events-none absolute left-[1.125rem] top-1/2 hidden h-5 w-5 -translate-y-1/2 text-zinc-400 sm:block"
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
              className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-70 sm:px-5"
            >
              {isLoading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      <nav
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-2 px-4 pt-5"
        aria-label="Popular gift guides"
      >
        {featuredGuides.map((guide) => (
          <Link
            key={guide.slug}
            href={`/gift-guides/${guide.slug}`}
            className="rounded-full bg-zinc-100 px-3.5 py-1.5 text-[13px] font-medium text-zinc-600 transition hover:bg-zinc-200 hover:text-zinc-950"
          >
            {guide.title}
          </Link>
        ))}
        <Link
          href="/gift-guides"
          className="px-1.5 py-1.5 text-[13px] font-semibold text-zinc-500 underline-offset-4 transition hover:text-red-600 hover:underline"
        >
          All guides →
        </Link>
      </nav>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:pt-14">
        <div className="mb-7 flex items-baseline justify-between gap-4 border-b border-zinc-100 pb-4">
          <h2 className="text-lg font-bold tracking-tight text-zinc-950 sm:text-xl">
            {hasSearch ? (
              <>Gifts for <span className="text-red-600">&ldquo;{activeQuery}&rdquo;</span></>
            ) : (
              'Today’s ridiculous finds'
            )}
          </h2>
          {hasSearch ? (
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
              className="shrink-0 text-sm font-semibold text-zinc-500 underline-offset-4 hover:text-red-600 hover:underline"
            >
              Clear search
            </button>
          ) : (
            <p className="hidden shrink-0 text-sm text-zinc-400 sm:block">New weirdness daily</p>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div
            className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-7"
            role="status"
            aria-live="polite"
            aria-label="Searching catalog"
          >
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex animate-pulse flex-col">
                <div className="aspect-square rounded-2xl bg-zinc-100" />
                <div className="mt-3 h-4 w-4/5 rounded bg-zinc-100" />
                <div className="mt-2 h-3 w-3/5 rounded bg-zinc-100" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 px-6 py-16 text-center">
            <p className="text-base font-semibold text-zinc-900">Nothing great for that one — yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
              We hunt down new weird gifts every day, and this search just told us what to look
              for next. Try a different angle in the meantime.
            </p>
          </div>
        ) : (
          <ProductGrid
            products={products}
            clickSource={hasSearch ? 'catalog_search' : 'catalog_home'}
            searchQueryId={searchId}
          />
        )}

        {!hasSearch && !isLoading && products.length > 0 && (
          <div className="mt-12 flex flex-col items-center gap-3">
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="min-w-44 rounded-full bg-zinc-950 px-7 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-60"
              >
                {isLoadingMore ? 'Digging up more…' : 'Show me more'}
              </button>
            ) : (
              <p className="text-sm font-medium text-zinc-400">You reached the end of the good stuff.</p>
            )}
            <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />
          </div>
        )}
      </div>
    </section>
  );
}
