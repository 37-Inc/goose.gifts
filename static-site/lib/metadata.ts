import type { Metadata } from "next";
import { createBrandOg, ogPath } from "./og";
import type { OgCard } from "./og";
import { siteIdentity, isSitePreview } from "./site-identity";

// Retain the import name for existing schema helpers; identity is explicit.
export const PREVIEW_ORIGIN = siteIdentity.origin;
export function previewMetadata(
  title: string,
  description: string,
  pathname: string,
  options: { indexable?: boolean; fixture?: boolean; image?: OgCard } = {},
): Metadata {
  const image = options.image || createBrandOg(siteIdentity);
  const imageUrl = `${siteIdentity.origin}${ogPath(image)}`;
  const indexable = !isSitePreview && options.indexable === true && options.fixture === false;
  return {
    title: `${title} — ${siteIdentity.name}${isSitePreview ? " preview" : ""}`,
    description,
    alternates: { canonical: `${PREVIEW_ORIGIN}${pathname}` },
    robots: { index: indexable, follow: !isSitePreview, noarchive: !indexable },
    openGraph: {
      title,
      description,
      url: `${PREVIEW_ORIGIN}${pathname}`,
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: image.title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [{ url: imageUrl, alt: image.title }] },
  };
}
