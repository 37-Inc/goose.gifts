import {
  analyzeWeirdGiftCatalog,
  HUMOR_SIGNAL_TERMS,
  MOTIF_DEFINITIONS,
  TITLE_SIGNAL_TERMS,
} from "../../lib/weird-gift-index-analysis";
import type { CatalogSnapshot } from "../../lib/catalog/types";
import { PUBLIC_CONTACT_EMAIL } from "../../lib/site";
import { PREVIEW_ORIGIN } from "./metadata";
import { readySnapshotProducts } from "./selection";

export function buildSnapshotIndex(snapshot: CatalogSnapshot) {
  const result = analyzeWeirdGiftCatalog(
    readySnapshotProducts(snapshot).map((p) => ({
      title: p.title,
      price: 0,
      source: p.source,
      updatedAt: snapshot.generatedAt,
    })),
  );
  return {
    ...result,
    scope: "snapshot_sample" as const,
    dataKind: snapshot.dataKind,
    generatedAt: snapshot.generatedAt,
    catalogRevision: snapshot.catalogRevision,
    methodology: {
      inclusion:
        "Ready, rights-cleared display records in one immutable snapshot sample. Held records are excluded. This is not the complete production catalog.",
      analyzedField:
        snapshot.dataKind === "synthetic_fixture"
          ? "Original fictional fixture titles only; not real product inventory."
          : "Original merchant title only.",
      normalization:
        "Lowercase; replace punctuation with spaces; match whole words or phrases.",
      categoryRule: "Categories overlap and should not be summed.",
      interpretation:
        "Counts describe this snapshot sample, not sales, popularity, demand, or quality. The sample may not represent the full catalog.",
      priceLimitation:
        "Offer prices are not exported; known-price coverage in the source catalog is not measured. Zero exported prices do not mean free products. No price conclusions are reported.",
      timestamp:
        "catalogUpdatedAt is the immutable snapshot generation time, not a merchant update timestamp.",
      humorSignalTerms: HUMOR_SIGNAL_TERMS,
      titleSignalTerms: TITLE_SIGNAL_TERMS,
      motifDictionaries: MOTIF_DEFINITIONS,
    },
    contact: PUBLIC_CONTACT_EMAIL,
    citation: `Ehrlich, Cameron. “The Weird Gift Index — snapshot sample.” Stupid Gifts, methodology edition ${result.version}; snapshot ${snapshot.generatedAt}.`,
  };
}
export type SnapshotIndex = ReturnType<typeof buildSnapshotIndex>;
export function snapshotIndexSchema(index: SnapshotIndex) {
  const url = `${PREVIEW_ORIGIN}/weird-gift-index`;
  const description = `Aggregate title analysis of ${index.totalProducts} ready records in a bounded snapshot sample, not the full production catalog.`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "The Weird Gift Index — snapshot sample",
        description,
        url,
        datePublished: index.publishedAt,
        dateModified: index.generatedAt,
        author: { "@type": "Person", name: "Cameron Ehrlich" },
      },
      {
        "@type": "Dataset",
        name: `Weird Gift Index ${index.version} — snapshot sample`,
        description,
        url,
        datePublished: index.generatedAt,
        creator: { "@type": "Organization", name: "Thirty Seven Inc." },
        measurementTechnique: index.methodology.normalization,
        distribution: {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${url}/data`,
        },
      },
    ],
  };
}
