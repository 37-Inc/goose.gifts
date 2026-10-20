import { notFound } from "next/navigation";
import { catalog, isFixtureRelease } from "../../../../lib/catalog";
import {
  directoryPages,
  directoryPage,
  directoryPath,
} from "../../../../lib/directory";
import { previewMetadata } from "../../../../lib/metadata";
import { Directory } from "../../../../components/Directory";

export const dynamicParams = false;
// Page 1 is a non-indexable finite asset; the Worker redirects its ordinary URL
// to /gifts. Keeping it finite also permits export of a one-page sample catalog.
export function generateStaticParams() {
  return directoryPages(catalog).map((page) => ({ page: String(page.page) }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  return previewMetadata(
    `The collection — page ${page}`,
    "Snapshot-only catalog browsing.",
    directoryPath(Number(page)),
    { indexable: Number(page) > 1 && Boolean(directoryPage(catalog, Number(page))?.products.length), fixture: isFixtureRelease },
  );
}
export default async function CatalogPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const result = /^\d+$/.test(page)
    ? directoryPage(catalog, Number(page))
    : undefined;
  if (!result) notFound();
  return <Directory page={result} illustrative={isFixtureRelease} />;
}
