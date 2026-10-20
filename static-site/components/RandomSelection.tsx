"use client";

import { useEffect, useState } from "react";
import type { PublicCatalogProduct } from "../../lib/catalog/types";
import { eligiblePool, nextRandomIndex } from "../lib/selection";
import { ProductCard } from "./ProductCard";

export function RandomSelection({
  products,
}: {
  products: PublicCatalogProduct[];
}) {
  const [pool, setPool] = useState(products);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!pool.length) return;
    const nextExpiry = Math.min(
      ...pool.map((product) => Date.parse(product.eligibleUntil)),
    );
    const timer = window.setTimeout(
      () => {
        setPool(eligiblePool(pool));
        setIndex(0);
      },
      Math.max(0, Math.min(2_147_483_647, nextExpiry - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [pool]);
  const product = pool[index];
  return (
    <section className="random-selection">
      {product ? (
        <>
          <ProductCard product={product} lead />
          <button
            className="button"
            disabled={pool.length < 2}
            onClick={() => {
              const fresh = eligiblePool(pool);
              if (fresh.length !== pool.length) {
                setPool(fresh);
                setIndex(0);
                return;
              }
              setIndex((current) => nextRandomIndex(pool.length, current));
            }}
          >
            Another questionable decision <span aria-hidden="true">↻</span>
          </button>
          <p className="quiet">
            {pool.length} examples in this versioned pool. No repeat on the next
            spin.
          </p>
        </>
      ) : (
        <div className="empty-state">
          <h2>The selection needs a fresh look.</h2>
          <p>
            We have stopped showing expired recommendations.{" "}
            <a href="/">Back to the collection →</a>
          </p>
        </div>
      )}
    </section>
  );
}
