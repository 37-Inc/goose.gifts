import type {
  CatalogSnapshot,
  PublicCatalogProduct,
} from "../../lib/catalog/types";
import { PREVIEW_ORIGIN } from "./metadata";
import { readySnapshotProducts } from "./selection";

export const DIRECTORY_PAGE_SIZE = 24;
export interface DirectoryPage {
  page: number;
  pageCount: number;
  total: number;
  products: PublicCatalogProduct[];
}
export function directoryPath(page: number) {
  return page === 1 ? "/gifts" : `/gifts/page/${page}`;
}
export function directoryPages(snapshot: CatalogSnapshot): DirectoryPage[] {
  const products = readySnapshotProducts(snapshot).sort(
    (a, b) => b.qualityScore - a.qualityScore || a.id.localeCompare(b.id),
  );
  const pageCount = Math.max(
    1,
    Math.ceil(products.length / DIRECTORY_PAGE_SIZE),
  );
  return Array.from({ length: pageCount }, (_, index) => ({
    page: index + 1,
    pageCount,
    total: products.length,
    products: products.slice(
      index * DIRECTORY_PAGE_SIZE,
      (index + 1) * DIRECTORY_PAGE_SIZE,
    ),
  }));
}
export function directoryPage(snapshot: CatalogSnapshot, page: number) {
  return Number.isSafeInteger(page) && page > 0
    ? directoryPages(snapshot)[page - 1]
    : undefined;
}
export function directorySchema(page: DirectoryPage) {
  const url = `${PREVIEW_ORIGIN}${directoryPath(page.page)}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "The collection",
    url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.products.length,
      itemListElement: page.products.map((p, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: p.punnyTitle || p.title,
        url: `${PREVIEW_ORIGIN}/gifts/${p.slug}`,
      })),
    },
  };
}
