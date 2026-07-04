import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-zinc-900">404</h1>
        <h2 className="mb-4 text-2xl font-semibold text-zinc-800">
          Gift Page Not Found
        </h2>
        <p className="mx-auto mb-8 max-w-md text-zinc-600">
          Looks like this page does not exist anymore. Search the live catalog
          for funny, weird, and actually purchasable gifts.
        </p>
        <Link
          href="/#catalog-search"
          className="inline-block rounded-lg bg-zinc-950 px-8 py-3 font-bold text-white shadow-lg transition hover:bg-red-700"
        >
          Search Gifts
        </Link>
      </div>
    </div>
  );
}
