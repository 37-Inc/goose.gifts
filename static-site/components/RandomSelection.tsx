"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogCard } from "../lib/card-shard";
import { fetchCardShard } from "../lib/card-shard";
import { eligiblePool, nextRandomIndex } from "../lib/selection";
import { ProductCard } from "./ProductCard";
import { captureRenderedLists, captureStaticRandomSpin } from "../lib/analytics";

export function RandomSelection({
  initial,
  poolSize,
  poolPath,
  catalogRevision,
  version,
}: {
  initial?: CatalogCard;
  poolSize: number;
  poolPath: string;
  catalogRevision: string;
  version: string;
}) {
  const [pool, setPool] = useState(initial ? [initial] : []);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => captureRenderedLists(), [pool, index]);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!pool.length) return;
    const nextExpiry = Math.min(
      ...pool.map((p) => Date.parse(p.eligibleUntil)),
    );
    const timer = window.setTimeout(
      () => {
        if (pool.some((p) => Date.parse(p.eligibleUntil) <= Date.now())) {
          pending.current?.abort();
          pending.current = null;
          setPool([]);
          setLoading(false);
        } else setPool((current) => [...current]);
      },
      Math.max(0, Math.min(2_147_483_647, nextExpiry - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [pool]);

  async function spin() {
    if (pending.current) return;
    const abort = new AbortController();
    pending.current = abort;
    setLoading(true);
    try {
      const choices = loaded
        ? eligiblePool(pool)
        : (
            await fetchCardShard(
              poolPath,
              { catalogRevision, version, kind: "random" },
              abort.signal,
            )
          ).products;
      if (abort.signal.aborted) return;
      if (
        !choices.length ||
        (loaded && choices.length !== pool.length) ||
        choices.length !== poolSize
      )
        throw new Error("Catalog shard unavailable");
      const current = choices.findIndex((p) => p.id === pool[index]?.id);
      setIndex(current < 0 ? 0 : nextRandomIndex(choices.length, current));
      setPool(choices);
      setLoaded(true);
      captureStaticRandomSpin();
    } catch {
      if (!abort.signal.aborted) setPool([]);
    } finally {
      if (pending.current === abort) {
        pending.current = null;
        setLoading(false);
      }
    }
  }
  const product = pool[index];
  return (
    <section className="random-selection">
      {product ? (
        <>
          <ProductCard product={product} lead context="random_gift" />
          <button
            type="button"
            className="button"
            disabled={poolSize < 2 || loading}
            onClick={spin}
          >
            {loading ? "Choosing another…" : "Another questionable decision"}{" "}
            <span aria-hidden="true">↻</span>
          </button>
          <p className="quiet" role="status" aria-live="polite">
            {poolSize} {initial?.illustrative ? "examples" : "gifts"} in this
            versioned pool.{poolSize > 1 && " No repeat on the next spin."}
          </p>
        </>
      ) : (
        <div className="empty-state">
          <h2>The selection needs a fresh look.</h2>
          <p>
            Choices are unavailable or need a freshness review.{" "}
            <a href="/">Browse gifts</a>
          </p>
        </div>
      )}
    </section>
  );
}
