import type { CatalogSnapshot } from "../../lib/catalog/types";

export interface EpisodeSlot {
  position: number;
  productPublicId: string | null;
  exactVariant: string | null;
  caption: string;
  alternativePublicIds: string[];
}
export interface EpisodeManifest {
  schemaVersion: 1;
  key: string;
  status: "draft" | "published";
  title: string;
  episodeDate: string | null;
  ownerConfirmed: boolean;
  presentationAssetsApproved: boolean;
  slots: EpisodeSlot[];
}

function invalid(message: string): never {
  throw new Error(`Invalid episode manifest: ${message}`);
}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    invalid("expected object");
  return input as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    invalid("unexpected field");
}
function text(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 240
  );
}

/** Publish is a separate evidence gate, never inferred from a draft or an asset. */
export function validateEpisodeManifest(
  input: unknown,
  catalog: CatalogSnapshot,
): EpisodeManifest {
  const value = object(structuredClone(input));
  keys(value, [
    "schemaVersion",
    "key",
    "status",
    "title",
    "episodeDate",
    "ownerConfirmed",
    "presentationAssetsApproved",
    "slots",
  ]);
  if (
    value.schemaVersion !== 1 ||
    typeof value.key !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.key) ||
    !["draft", "published"].includes(String(value.status)) ||
    !text(value.title) ||
    typeof value.ownerConfirmed !== "boolean" ||
    typeof value.presentationAssetsApproved !== "boolean" ||
    !Array.isArray(value.slots) ||
    value.slots.length < 2 ||
    value.slots.length > 3
  )
    invalid("header");
  if (
    value.episodeDate !== null &&
    (typeof value.episodeDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.episodeDate) ||
      !Number.isFinite(Date.parse(`${value.episodeDate}T00:00:00.000Z`)) ||
      new Date(`${value.episodeDate}T00:00:00.000Z`)
        .toISOString()
        .slice(0, 10) !== value.episodeDate)
  )
    invalid("episode date");
  const all = new Set(
    [...catalog.products, ...catalog.heldProducts].map(
      (product) => product.publicId,
    ),
  );
  const selected = new Set<string>();
  value.slots.forEach((raw, index) => {
    const slot = object(raw);
    keys(slot, [
      "position",
      "productPublicId",
      "exactVariant",
      "caption",
      "alternativePublicIds",
    ]);
    if (
      slot.position !== index + 1 ||
      !text(slot.caption) ||
      !Array.isArray(slot.alternativePublicIds) ||
      slot.alternativePublicIds.length > 3 ||
      new Set(slot.alternativePublicIds).size !==
        slot.alternativePublicIds.length ||
      slot.alternativePublicIds.some(
        (id) =>
          typeof id !== "string" || !all.has(id) || id === slot.productPublicId,
      )
    )
      invalid("slot");
    if (slot.productPublicId !== null) {
      if (
        typeof slot.productPublicId !== "string" ||
        !all.has(slot.productPublicId) ||
        selected.has(slot.productPublicId) ||
        !text(slot.exactVariant)
      )
        invalid("exact product variant");
      selected.add(slot.productPublicId);
    } else if (slot.exactVariant !== null || slot.alternativePublicIds.length)
      invalid("pending slot");
    if (
      value.status === "published" &&
      typeof slot.productPublicId !== "string"
    )
      invalid("published product missing");
  });
  if (
    value.status === "published" &&
    (!value.ownerConfirmed ||
      !value.episodeDate ||
      !value.presentationAssetsApproved ||
      catalog.dataKind === "synthetic_fixture")
  )
    invalid("publication evidence");
  return Object.freeze(value) as unknown as EpisodeManifest;
}

export function publishedEpisodes(episodes: EpisodeManifest[]) {
  return episodes
    .filter((episode) => episode.status === "published")
    .sort((a, b) => (b.episodeDate || "").localeCompare(a.episodeDate || ""));
}

/** Initial release requires current availability; later archives retain exact
 * identities even when a product moves to held, with labeled alternatives. */
export function assertEpisodePublishable(
  episode: EpisodeManifest,
  catalog: CatalogSnapshot,
) {
  validateEpisodeManifest(episode, catalog);
  if (
    episode.status !== "published" ||
    episode.slots.some(
      (slot) =>
        !catalog.products.some(
          (product) => product.publicId === slot.productPublicId,
        ),
    )
  )
    invalid("initial products not eligible");
}
