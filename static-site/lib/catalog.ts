import fs from "node:fs";
import path from "node:path";
import { validateCatalogSnapshot } from "../../lib/catalog/snapshot";
import { catalogDisplayView } from "../../lib/catalog/display";
import fixtureSnapshot from "../fixtures/catalog.snapshot.json";
import { createBrowseRelease } from "./browse";
import { createPhotoRelease } from "./photos";

// Exactly one immutable input per build, never a database or provider adapter.
// The release command supplies a private, validated snapshot path for real cohorts.
const input = process.env.CATALOG_SNAPSHOT_PATH
  ? JSON.parse(
      fs.readFileSync(path.resolve(process.env.CATALOG_SNAPSHOT_PATH), "utf8"),
    )
  : fixtureSnapshot;
export const sealedCatalog = validateCatalogSnapshot(input, new Date());
export const catalog = catalogDisplayView(sealedCatalog);
export const photos = createPhotoRelease(sealedCatalog);
export const isFixtureRelease = catalog.dataKind === "synthetic_fixture";
export const browse = createBrowseRelease(catalog);
