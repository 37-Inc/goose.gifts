"use client";

import { useEffect, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { unavailableEpisode } from "../lib/episode-display";
import type { DisplayEpisode } from "../lib/episode-display";
import { captureRenderedLists } from "../lib/analytics";
import { siteIdentity } from "../lib/site-identity";

export function Presentation({
  episode,
  qrSvg = null,
}: {
  episode: DisplayEpisode;
  qrSvg?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!episode.eligibleUntil) return;
    const deadline = Date.parse(episode.eligibleUntil);
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (Date.now() >= deadline) setExpired(true);
        else schedule();
      }, Math.max(0, Math.min(2_147_483_647, deadline - Date.now())));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [episode.eligibleUntil]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        (event.target instanceof HTMLElement &&
          (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) ||
            event.target.isContentEditable ||
            (event.key === " " &&
              ["BUTTON", "A"].includes(event.target.tagName))))
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
  const visible = expired ? unavailableEpisode(episode) : episode;
  const slot = visible.slots[index];
  const product = slot.primary;
  useEffect(() => captureRenderedLists(), [index, expired]);
  return (
    <div className="presentation" aria-label="Episode presentation preview">
      <div className="presentation-top">
        <span className="wordmark">
          {siteIdentity.brand}<span>.</span>gifts
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
              <span>{episode.status === "draft" ? "?" : "—"}</span>
              <small>{episode.status === "draft" ? "A GOOD BAD IDEA GOES HERE." : "ORIGINAL SELECTION UNAVAILABLE."}</small>
            </div>
          )}
        </div>
        <div className="presentation-copy"
          data-analytics-card={product ? "" : undefined}
          data-analytics-id={product?.id} data-analytics-source={product?.source}
          data-analytics-context={`show_presentation:${episode.key}`}
          data-analytics-expiry={product?.eligibleUntil}>
          <p className="eyebrow">
            Selection {String(index + 1).padStart(2, "0")}
          </p>
          <h1>{product?.punnyTitle || product?.title || (episode.status === "draft" ? "Worth waiting for." : "Original selection unavailable.")}</h1>
          <p>{slot.caption}</p>
          {product ? (
            <>
              <p className="variant">Original exact variant: {slot.exactVariant}</p>
              <a className="text-action" data-analytics-product-link="" href={`/gifts/${product.slug}`}>
                {siteIdentity.hostname}/gifts/{product.slug}
              </a>
            </>
          ) : (
            <p className="variant">
              {episode.status === "draft" ? "No product, variant, retailer or airing date is confirmed."
                : `Original exact variant: ${slot.exactVariant}. Original ID: ${slot.originalPublicId}.`}
            </p>
          )}
          {slot.alternatives.length > 0 && (
            <div className="presentation-alternatives">
              <h2>Clearly labeled alternatives</h2>
              {slot.alternatives.map((alternative) => (
                <span key={alternative.publicId} data-analytics-card="" data-analytics-id={alternative.id}
                  data-analytics-source={alternative.source} data-analytics-context={`show_presentation_alternative:${episode.key}`}
                  data-analytics-expiry={alternative.eligibleUntil}>
                  <a data-analytics-product-link="" href={`/gifts/${alternative.slug}`} aria-label={`Alternative: ${alternative.title}`}>
                    Alternative: {alternative.punnyTitle || alternative.title}
                  </a>
                </span>
              ))}
            </div>
          )}
          {episode.shareUrl && qrSvg && <aside className="presentation-share">
            <a className="episode-qr" href={episode.shareUrl} aria-label="Open this episode selection"
              dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <a href={episode.shareUrl}>{siteIdentity.hostname}/howie/{episode.key}</a>
          </aside>}
        </div>
      </div>
      <div className="presentation-bottom">
        <a href={episode.status === "published" ? `/howie/${episode.key}` : "/howie"}>Visitor landing page</a>
        <span>
          {index + 1} / {episode.slots.length}
        </span>
        <div>
          <button
            aria-label="Previous selection"
            disabled={index === 0}
            onClick={() => setIndex((current) => current - 1)}
          >
            Previous
          </button>
          <button
            aria-label="Next selection"
            disabled={index === episode.slots.length - 1}
            onClick={() => setIndex((current) => current + 1)}
          >
            Next
          </button>
        </div>
        <span className="quiet">Arrow keys · Home / End</span>
      </div>
    </div>
  );
}
