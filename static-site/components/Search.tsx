"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicCatalogProduct } from "../../lib/catalog/types";
import { ProductCard } from "./ProductCard";

type SearchState = {
  status: "idle" | "loading" | "ready" | "unavailable";
  products: PublicCatalogProduct[];
};

export function Search() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({
    status: "idle",
    products: [],
  });
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    const search = async () => {
      const q = (new URLSearchParams(window.location.search).get("q") || "")
        .trim()
        .slice(0, 200);
      setQuery(q);
      controller.current?.abort();
      const request = ++sequence.current;
      if (q.length < 2) {
        setState({ status: "idle", products: [] });
        return;
      }
      const abort = new AbortController();
      controller.current = abort;
      setState({ status: "loading", products: [] });
      try {
        const response = await fetch(
          `/api/search-products?q=${encodeURIComponent(q)}&limit=36`,
          { signal: abort.signal },
        );
        if (!response.ok) throw new Error("Search unavailable");
        const data = await response.json();
        if (!Array.isArray(data.results))
          throw new Error("Invalid search response");
        // API owns eligibility and public-field validation. Expiry is checked again
        // before showing results, including a response received across its deadline.
        const products = data.results
          .filter(
            (product: PublicCatalogProduct) =>
              typeof product.slug === "string" &&
              typeof product.eligibleUntil === "string" &&
              Date.parse(product.eligibleUntil) > Date.now(),
          )
          .slice(0, 36);
        if (active && request === sequence.current)
          setState({ status: "ready", products });
      } catch {
        if (active && !abort.signal.aborted && request === sequence.current)
          setState({ status: "unavailable", products: [] });
      }
    };
    void search();
    window.addEventListener("popstate", search);
    window.addEventListener("catalog-search", search);
    return () => {
      active = false;
      controller.current?.abort();
      window.removeEventListener("popstate", search);
      window.removeEventListener("catalog-search", search);
    };
  }, []);

  useEffect(() => {
    if (!state.products.length) return;
    const deadline = Math.min(
      ...state.products.map((product) => Date.parse(product.eligibleUntil)),
    );
    const timer = window.setTimeout(
      () =>
        setState((current) => ({
          ...current,
          products: current.products.filter(
            (product) => Date.parse(product.eligibleUntil) > Date.now(),
          ),
        })),
      Math.max(0, Math.min(2_147_483_647, deadline - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [state.products]);

  const hasQuery = query.trim().length >= 2;
  return (
    <section
      className="search-section"
      aria-label="Find a gift"
      id="catalog-search"
    >
      <form
        className="search-form"
        action="/"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          const q = query.trim().slice(0, 200);
          const url = new URL(window.location.href);
          if (q) url.searchParams.set("q", q);
          else url.searchParams.delete("q");
          window.history.pushState(null, "", `${url.pathname}${url.search}`);
          window.dispatchEvent(new Event("catalog-search"));
        }}
      >
        <label className="sr-only" htmlFor="gift-query">
          Search the collection
        </label>
        <input
          id="gift-query"
          name="q"
          type="search"
          placeholder="For the person who has everything…"
          value={query}
          minLength={2}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">
          Find a gift <span aria-hidden="true">↗</span>
        </button>
      </form>
      <div role="status" aria-live="polite">
        {state.status === "loading" && (
          <p className="search-status">Looking through the collection…</p>
        )}
        {state.status === "unavailable" && (
          <p className="search-status">
            Search is taking a break. The collection below still works.{" "}
            <a href="/gifts">Browse all gifts →</a>
          </p>
        )}
        {state.status === "ready" && (
          <p className="search-status">
            {state.products.length
              ? `${state.products.length} ${state.products.length === 1 ? "gift" : "gifts"} to consider.`
              : "Nothing quite right yet. Try a different description, or browse the collection."}
          </p>
        )}
        {!hasQuery && query.length === 1 && (
          <p className="search-status">Use at least two characters.</p>
        )}
      </div>
      {state.status === "ready" && state.products.length > 0 && (
        <div className="catalog-grid">
          <h2 className="sr-only">Search results</h2>
          {state.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
