"use client";

import { useEffect, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import type { EpisodeManifest } from "../../content/show/manifest";
import type { PublicCatalogProduct } from "../../lib/catalog/types";

export function Presentation({
  episode,
  products,
}: {
  episode: EpisodeManifest;
  products: PublicCatalogProduct[];
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        (event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA", "BUTTON", "A"].includes(event.target.tagName))
      )
        return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        setIndex((current) => Math.min(episode.slots.length - 1, current + 1));
      }
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        setIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "Home") {
        event.preventDefault();
        setIndex(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        setIndex(episode.slots.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [episode.slots.length]);
  const slot = episode.slots[index];
  const product = products.find(
    (item) => item.publicId === slot.productPublicId,
  );
  return (
    <div className="presentation" aria-label="Episode presentation preview">
      <div className="presentation-top">
        <span className="wordmark">
          stupid<span>.</span>gifts
        </span>
        <span className="eyebrow">
          {episode.status === "draft"
            ? "Unpublished draft · no appearance confirmed"
            : episode.episodeDate}
        </span>
      </div>
      <div className="presentation-slide" aria-live="polite">
        <div className="presentation-art">
          {product ? (
            <ProductImage
              imageUrl={product.imageUrl}
              alt={product.title}
              className="object-contain"
              sizes="55vw"
              priority
            />
          ) : (
            <div className="pending-art" aria-label="Product not selected">
              <span>?</span>
              <small>A GOOD BAD IDEA GOES HERE.</small>
            </div>
          )}
        </div>
        <div className="presentation-copy">
          <p className="eyebrow">
            Selection {String(index + 1).padStart(2, "0")}
          </p>
          <h1>{product?.title || "Worth waiting for."}</h1>
          <p>{slot.caption}</p>
          {product ? (
            <>
              <p className="variant">Exact variant: {slot.exactVariant}</p>
              <a className="text-action" href={`/gifts/${product.slug}`}>
                stupid.gifts/gifts/{product.slug} ↗
              </a>
            </>
          ) : (
            <p className="variant">
              No product, variant, retailer or airing date is confirmed.
            </p>
          )}
          {slot.alternativePublicIds.length > 0 && (
            <div className="presentation-alternatives">
              <h2>Clearly labeled alternatives</h2>
              {slot.alternativePublicIds.map((id) => {
                const alternative = products.find(
                  (item) => item.publicId === id,
                );
                return alternative ? (
                  <a key={id} href={`/gifts/${alternative.slug}`}>
                    Alternative: {alternative.title} →
                  </a>
                ) : (
                  <p key={id}>Alternative currently unavailable.</p>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="presentation-bottom">
        <a href="/howie">Visitor landing page ↗</a>
        <span>
          {index + 1} / {episode.slots.length}
        </span>
        <div>
          <button
            aria-label="Previous selection"
            disabled={index === 0}
            onClick={() => setIndex((current) => current - 1)}
          >
            ←
          </button>
          <button
            aria-label="Next selection"
            disabled={index === episode.slots.length - 1}
            onClick={() => setIndex((current) => current + 1)}
          >
            →
          </button>
        </div>
        <span className="quiet">← → keys · Home / End</span>
      </div>
    </div>
  );
}
