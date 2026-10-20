import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateCatalogSnapshot } from "../lib/catalog/snapshot.ts";
import {
  validateEpisodeManifest,
  publishedEpisodes,
  assertEpisodePublishable,
} from "../content/show/manifest.ts";

const drafts = JSON.parse(
  fs.readFileSync(new URL("../content/show/drafts.json", import.meta.url)),
);
const catalog = validateCatalogSnapshot(
  JSON.parse(
    fs.readFileSync(
      new URL("../static-site/fixtures/catalog.snapshot.json", import.meta.url),
    ),
  ),
  new Date("2026-10-20T00:00:00.000Z"),
);
test("four draft weekly slots are truthful and never public episodes", () => {
  const episodes = drafts.map((draft) =>
    validateEpisodeManifest(draft, catalog),
  );
  assert.equal(episodes.length, 4);
  assert.equal(publishedEpisodes(episodes).length, 0);
  assert.ok(
    episodes.every(
      (episode) =>
        episode.episodeDate === null &&
        !episode.ownerConfirmed &&
        episode.slots.every((slot) => slot.productPublicId === null),
    ),
  );
});
test("invalid exact identity, variant, order and invented metadata fail", () => {
  for (const patch of [
    { position: 3 },
    { productPublicId: "not-a-product", exactVariant: "red" },
    { productPublicId: catalog.products[0].publicId },
    { alternativePublicIds: [catalog.products[0].publicId] },
    { internalNotes: "must not ship" },
  ]) {
    const changed = structuredClone(drafts[0]);
    Object.assign(changed.slots[0], patch);
    assert.throws(
      () => validateEpisodeManifest(changed, catalog),
      /Invalid episode manifest/,
    );
  }
});
test("publication cannot be inferred from a fixture or incomplete approvals", () => {
  const changed = structuredClone(drafts[0]);
  changed.status = "published";
  changed.episodeDate = "2026-10-19";
  changed.slots.forEach((slot, index) => {
    slot.productPublicId = catalog.products[index].publicId;
    slot.exactVariant = "An explicitly recorded exact variant";
  });
  assert.throws(
    () => validateEpisodeManifest(changed, catalog),
    /publication evidence/,
  );
  changed.ownerConfirmed = true;
  changed.presentationAssetsApproved = true;
  assert.throws(
    () => validateEpisodeManifest(changed, catalog),
    /publication evidence/,
  );
  assert.throws(
    () => assertEpisodePublishable(drafts[0], catalog),
    /initial products/,
  );
});
