import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { ProductGrid } from '@/components/ProductGrid';
import { PageHero, HeroUnderline } from '@/components/ui/PageHero';
import { getIndexableGiftDirectoryPage } from '@/lib/db/gift-pages';

export const revalidate = 3600;

const DIRECTORY_TITLE = 'Funny and Weird Gift Catalog | goose.gifts';
const DIRECTORY_DESCRIPTION = 'Browse product-specific gift writeups for funny, strange, useful, and genuinely giftable finds from the goose.gifts catalog.';

interface GiftDirectoryProps {
  searchParams?: Promise<{ page?: string | string[] }>;
}

export async function generateMetadata({ searchParams }: GiftDirectoryProps): Promise<Metadata> {
  const query = searchParams ? await searchParams : {};
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const page = Math.max(1, Number.parseInt(rawPage || '1', 10) || 1);
  return {
    title: DIRECTORY_TITLE,
    description: DIRECTORY_DESCRIPTION,
    alternates: { canonical: page === 1 ? '/gifts' : `/gifts?page=${page}` },
  };
}

export default async function GiftDirectoryPage({ searchParams }: GiftDirectoryProps) {
  const query = searchParams ? await searchParams : {};
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const requestedPage = Math.max(1, Number.parseInt(rawPage || '1', 10) || 1);
  const directory = await getIndexableGiftDirectoryPage(requestedPage, 24);

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <Header />
      <PageHero
        title={<>Funny gifts with the <HeroUnderline>actual story</HeroUnderline></>}
        subtitle="Product-specific notes on what each strange object is, why it works as a gift, and what to check before ordering."
      />

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:pt-14">
        <div className="mb-8 flex items-end justify-between gap-4 border-b border-zinc-100 pb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Reviewed gift pages</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {directory.total.toLocaleString()} distinct products with current listing evidence and substantive editorial.
            </p>
          </div>
          <p className="text-sm text-zinc-400">Page {directory.page} of {directory.pageCount}</p>
        </div>

        <ProductGrid products={directory.products} clickSource="gift_directory" contextSlug={`page-${directory.page}`} />

        {directory.pageCount > 1 ? (
          <nav className="mt-12 flex items-center justify-center gap-3 text-sm font-semibold" aria-label="Gift catalog pages">
            {directory.page > 1 ? (
              <Link className="rounded-full border border-zinc-200 px-5 py-2.5 transition hover:border-brand hover:text-brand" href={directory.page === 2 ? '/gifts' : `/gifts?page=${directory.page - 1}`}>
                Previous
              </Link>
            ) : null}
            {directory.page < directory.pageCount ? (
              <Link className="rounded-full bg-zinc-950 px-5 py-2.5 text-white transition hover:bg-brand" href={`/gifts?page=${directory.page + 1}`}>
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
