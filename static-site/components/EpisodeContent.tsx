import { CatalogImage } from "./CatalogPhotos";
import type { DisplayEpisode, EpisodeProduct } from "../lib/episode-display";
import { episodePath } from "../lib/show";
import { Icon } from "./Icon";

function Product({ product, context, caption, position }: {
  product: EpisodeProduct; context: string; caption: string; position?: number;
}) {
  return (
    <article className="episode-product"
      data-analytics-card="" data-analytics-id={product.id}
      data-analytics-source={product.source} data-analytics-context={context}
      data-analytics-expiry={product.eligibleUntil ?? undefined}
      data-analytics-permanent={product.eligibleUntil === null ? "" : undefined}>
      <a className="product-art retailer-art" data-analytics-product-link=""
        href={`/gifts/${product.slug}`} aria-label={`View ${product.title}`}>
        <CatalogImage id={product.id} imageUrl={product.imageUrl} alt={product.title} className="object-contain"
          sizes="(max-width: 700px) 90vw, 45vw" priority={position === 1} />
      </a>
      <div className="episode-product-copy">
        {position && <p className="eyebrow">Selection {String(position).padStart(2, "0")}</p>}
        <h2><a data-analytics-product-link="" href={`/gifts/${product.slug}`}>
          {product.punnyTitle || product.title}
        </a></h2>
        <p>{caption}</p>
        <a className="button" data-analytics-outbound="" href={product.affiliateUrl}
          target="_blank" rel="sponsored noopener noreferrer">
          Check price on {product.source === "amazon" ? "Amazon" : "Etsy"}
          <Icon name="external" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </article>
  );
}

export function EpisodeContent({ episode }: { episode: DisplayEpisode }) {
  return (
    <>
      <div className="episode-selections">
        {episode.slots.map((slot) => (
          <section className="episode-selection" key={slot.position}>
            {slot.primary ? (
              <Product product={slot.primary} caption={slot.caption} position={slot.position}
                context={`show_episode:${episode.key}`} />
            ) : (
              <div className="episode-unavailable">
                <p className="eyebrow">Selection {String(slot.position).padStart(2, "0")}</p>
                <h2>Original selection unavailable.</h2>
                <p>We have not replaced the product recorded for this episode.</p>
              </div>
            )}
            <details className="episode-identity">
              <summary>Original selection record</summary>
              <p>Exact variant: {slot.exactVariant}</p>
              <p>Original product ID: <code>{slot.originalPublicId}</code></p>
            </details>
            {slot.alternatives.length > 0 && (
              <div className="episode-alternatives">
                <h3>Eligible alternatives · not the original selection</h3>
                {slot.alternatives.map((product) => (
                  <Product key={product.publicId} product={product}
                    caption="An alternative, not the product recorded for this episode."
                    context={`show_alternative:${episode.key}`} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      <p className="quiet episode-disclosure">
        Check current price and availability at the retailer. We may earn a commission.
        As an Amazon Associate we earn from qualifying purchases.
      </p>
    </>
  );
}

export function EpisodeArchive({ episodes, current }: { episodes: DisplayEpisode[]; current?: string }) {
  const previous = episodes.filter((episode) => episode.key !== current);
  if (!previous.length) return null;
  return (
    <section className="episode-archive section-block">
      <h2>{current === episodes[0]?.key ? "Previous selections." : "Other episode selections."}</h2>
      <ul>{previous.map((episode) => (
        <li key={episode.key}><a href={episodePath(episode.key)}>
          <time dateTime={episode.episodeDate!}>{episode.episodeDate}</time> {episode.title}
        </a></li>
      ))}</ul>
    </section>
  );
}
