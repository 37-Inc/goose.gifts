import type { Metadata } from "next";

export const PREVIEW_ORIGIN = "https://staging.stupid.gifts";
export function previewMetadata(
  title: string,
  description: string,
  pathname: string,
): Metadata {
  return {
    title: `${title} — Stupid Gifts preview`,
    description,
    alternates: { canonical: `${PREVIEW_ORIGIN}${pathname}` },
    robots: { index: false, follow: false, noarchive: true },
    openGraph: {
      title,
      description,
      url: `${PREVIEW_ORIGIN}${pathname}`,
      type: "website",
    },
  };
}
