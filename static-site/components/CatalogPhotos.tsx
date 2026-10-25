"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { PHOTO_PLACEHOLDER, photoVersion, validatePhotoIndex, validatePhotoShard } from "../lib/photo-shard";
import { Icon } from "./Icon";
import { shortProductName } from "../lib/product-presentation";

const PhotoContext = createContext<{ indexPath: string | null; photoSlots: readonly string[];
  editorialDisclosures: Readonly<Record<string, string>>; cardTitles: Readonly<Record<string, string>>;
  descriptions: Readonly<Record<string, string>>; cardNotes: Readonly<Record<string, string>>;
}>({ indexPath: null, photoSlots: [], editorialDisclosures: {}, cardTitles: {}, descriptions: {}, cardNotes: {} });
const pending = new Map<string, Promise<unknown>>();
async function read(path: string, validate: (value: unknown) => unknown): Promise<unknown> {
  const existing = pending.get(path);
  if (existing) return existing;
  if (pending.size >= 512) pending.delete(pending.keys().next().value!);
  const request = (async () => {
    const abort = new AbortController(), timer = window.setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetch(path, { signal: abort.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Unavailable");
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > 512 * 1024) throw new Error("Unavailable");
      const value = validate(JSON.parse(text)) as { eligibleUntil?: string };
      // Supplier URL bytes leave the shared in-memory cache at their original deadline.
      if (typeof value.eligibleUntil === "string") {
        const remaining = Date.parse(value.eligibleUntil) - Date.now();
        if (!Number.isFinite(remaining) || remaining <= 0) throw new Error("Unavailable");
        window.setTimeout(() => pending.delete(path), Math.min(remaining, 2_147_483_647));
      }
      return value;
    } finally { window.clearTimeout(timer); }
  })();
  pending.set(path, request);
  void request.catch(() => pending.delete(path));
  return request;
}

export function CatalogPhotos({ indexPath, photoSlots = [], editorialDisclosures = {}, cardTitles = {}, descriptions = {}, cardNotes = {}, children }: {
  indexPath: string | null; photoSlots?: readonly string[]; editorialDisclosures?: Readonly<Record<string, string>>;
  cardTitles?: Readonly<Record<string, string>>; descriptions?: Readonly<Record<string, string>>;
  cardNotes?: Readonly<Record<string, string>>; children: React.ReactNode;
}) {
  return <PhotoContext.Provider value={{ indexPath, photoSlots, editorialDisclosures, cardTitles, descriptions, cardNotes }}>{children}</PhotoContext.Provider>;
}

export function CatalogTitle({ source, id, fallback }: { source: string; id: string; fallback: string }) {
  const titles = useContext(PhotoContext).cardTitles;
  return source === "amazon" && Object.hasOwn(titles, id) ? titles[id] : shortProductName(fallback);
}

export function CatalogDescription({ id, source, fallback, card = false }: {
  id: string; source: string; fallback?: string; card?: boolean;
}) {
  const copy = useContext(PhotoContext);
  const description = source === "amazon" && Object.hasOwn(copy.descriptions, id) ? copy.descriptions[id] : undefined;
  const note = card && source === "amazon" && Object.hasOwn(copy.cardNotes, id) ? copy.cardNotes[id] : undefined;
  const text = note?.trim() || description?.trim() || fallback?.trim();
  return text ? <p className={card ? "card-description" : "detail-line"}>{text}</p> : null;
}

/** Independently authored site copy; never changes the supplied catalog product. */
export function CatalogDisclosure({ source, id }: { source: string; id: string }) {
  const text = useContext(PhotoContext).editorialDisclosures[`${source}/${id}`];
  return text ? <p className="product-disclosure">{text}</p> : null;
}

/** Slot IDs reserve the original photo geometry, not rights or supplier URLs.
 * A missing/expired overlay never expands a compact card after hydration. */
export function CatalogCardArt({ href, label, illustrative = false, ...props }: React.ComponentProps<typeof CatalogImage>
  & { href: string; label: string; illustrative?: boolean }) {
  const { photoSlots } = useContext(PhotoContext);
  const compact = props.imageUrl === PHOTO_PLACEHOLDER && !photoSlots.includes(props.id);
  return <a data-analytics-product-link="" className={`product-art${illustrative ? "" : " retailer-art"}${compact ? " photo-unavailable" : ""}`}
    href={href} aria-label={label}>
    {compact ? <><Icon name="gift" /><span>Photo unavailable</span></> : <CatalogImage {...props} />}
  </a>;
}

export function CatalogImage({ id, ...props }: React.ComponentProps<typeof ProductImage> & { id: string }) {
  const { indexPath } = useContext(PhotoContext);
  return <PhotoImage key={`${id}:${indexPath}:${props.imageUrl}`} id={id} indexPath={indexPath} {...props} />;
}
function PhotoImage({ id, indexPath, ...props }: React.ComponentProps<typeof ProductImage> & { id: string; indexPath: string | null }) {
  const [photo, setPhoto] = useState<{ imageUrl: string; eligibleUntil: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!indexPath || props.imageUrl !== PHOTO_PLACEHOLDER) return;
    void (async () => {
      try {
        const version = photoVersion(indexPath), index = validatePhotoIndex(await read(indexPath, value => validatePhotoIndex(value, version)), version);
        const entry = Object.hasOwn(index.products, id) ? index.products[id] : undefined;
        if (!entry || Date.parse(entry.eligibleUntil) <= Date.now()) return;
        const shard = validatePhotoShard(await read(`/catalog/${version}/photos-${entry.shard}.json`,
          value => validatePhotoShard(value, version, Date.now())), version, Date.now());
        const image = Object.hasOwn(shard.images, id) ? shard.images[id] : undefined;
        if (!image || shard.eligibleUntil !== entry.eligibleUntil) return;
        if (!cancelled) setPhoto({ imageUrl: image.imageUrl, eligibleUntil: shard.eligibleUntil });
      } catch { /* The independently cleared listing remains usable without a photo. */ }
    })();
    return () => { cancelled = true; };
  }, [id, indexPath, props.imageUrl]);
  useEffect(() => {
    if (!photo) return;
    const expire = () => { if (Date.parse(photo.eligibleUntil) <= Date.now()) setPhoto(null); };
    const timer = window.setTimeout(expire, Math.max(0, Date.parse(photo.eligibleUntil) - Date.now()));
    window.addEventListener("pageshow", expire);
    document.addEventListener("visibilitychange", expire);
    return () => { window.clearTimeout(timer); window.removeEventListener("pageshow", expire); document.removeEventListener("visibilitychange", expire); };
  }, [photo]);
  const imageUrl = photo?.imageUrl ?? props.imageUrl;
  return <ProductImage {...props} key={imageUrl} imageUrl={imageUrl} alt={imageUrl === PHOTO_PLACEHOLDER ? "" : props.alt} />;
}
