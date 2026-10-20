"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogCard } from "../lib/card-shard";
import { fetchCardShard } from "../lib/card-shard";
import { ProductCard } from "./ProductCard";
import { captureRenderedLists } from "../lib/analytics";

export function CatalogFeed({
  initial,
  next,
  ...release
}: {
  initial: CatalogCard[];
  next: string | null;
  catalogRevision: string;
  version: string;
}) {
  const [state, setState] = useState({
    products: initial,
    next,
    status: "ready" as "ready" | "loading" | "unavailable",
  });
  const pending = useRef<AbortController | null>(null);
  useEffect(() => captureRenderedLists(), [state.products]);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!state.products.length) return;
    const deadline = Math.min(
      ...state.products.map((p) => Date.parse(p.eligibleUntil)),
    );
    const timer = window.setTimeout(
      () => {
        if (
          state.products.some((p) => Date.parse(p.eligibleUntil) <= Date.now())
        ) {
          pending.current?.abort();
          pending.current = null;
          setState({ products: [], next: null, status: "unavailable" });
        } else
          setState((current) => ({
            ...current,
            products: [...current.products],
          }));
      },
      Math.max(0, Math.min(2_147_483_647, deadline - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [state.products]);

  async function more() {
    if (!state.next || pending.current) return;
    const abort = new AbortController();
    pending.current = abort;
    setState((current) => ({ ...current, status: "loading" }));
    try {
      const data = await fetchCardShard(
        state.next,
        { ...release, kind: "feed" },
        abort.signal,
      );
      if (abort.signal.aborted) return;
      const seen = new Set(state.products.map((p) => p.id));
      if (
        state.products.some((p) => Date.parse(p.eligibleUntil) <= Date.now()) ||
        data.products.some((p) => seen.has(p.id)) ||
        data.next === state.next
      )
        throw new Error("Catalog shard unavailable");
      setState({
        products: [...state.products, ...data.products],
        next: data.next,
        status: "ready",
      });
    } catch {
      if (!abort.signal.aborted)
        setState({ products: [], next: null, status: "unavailable" });
    } finally {
      if (pending.current === abort) pending.current = null;
    }
  }
  if (!initial.length && !next) return null;
  return (
    <section
      className="browse-feed section-block"
      aria-labelledby="browse-heading"
    >
      <div className="section-heading">
        <h2 id="browse-heading">More questionable decisions.</h2>
        <a href="/gifts" className="text-action">
          Full collection ↗
        </a>
      </div>
      {state.products.length > 0 && (
        <div className="catalog-grid">
          {state.products.map((product) => (
            <ProductCard key={product.id} product={product} context="home_browse" />
          ))}
        </div>
      )}
      <div role="status" aria-live="polite">
        {state.status === "unavailable" && (
          <p className="search-status">
            This collection needs a fresh look.{" "}
            <a href="/gifts">Browse the latest collection →</a>
          </p>
        )}
        {state.status === "loading" && (
          <p className="quiet">Loading a few more ideas…</p>
        )}
      </div>
      {state.next && (
        <button
          type="button"
          className="button"
          disabled={state.status === "loading"}
          onClick={more}
        >
          More gifts <span aria-hidden="true">↓</span>
        </button>
      )}
    </section>
  );
}
