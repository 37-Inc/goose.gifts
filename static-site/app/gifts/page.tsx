import { catalog, isFixtureRelease } from "../../lib/catalog";
import { Directory as CatalogDirectory } from "../../components/Directory";
import { directoryPage } from "../../lib/directory";
import { previewMetadata } from "../../lib/metadata";
import { isSitePreview } from "../../lib/site-identity";
export const metadata = previewMetadata(
  "The collection",
  isFixtureRelease
    ? "Rights-cleared illustrative examples for the static migration proof, not purchasable products."
    : isSitePreview ? "A bounded catalog cohort for the isolated staging migration proof. Not a public launch."
      : "Explore the curated collection of ridiculous gifts.",
  "/gifts",
  { indexable: catalog.products.length > 0, fixture: isFixtureRelease },
);
export default function Directory() {
  return (
    <CatalogDirectory
      page={directoryPage(catalog, 1)!}
      illustrative={isFixtureRelease}
    />
  );
}
