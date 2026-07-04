import Link from 'next/link';
import Image from 'next/image';

interface HeaderProps {
  initialQuery?: string;
}

export function Header({ initialQuery = '' }: HeaderProps) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-900 transition-colors hover:text-red-700 group">
          <Image
            src="/sillygoose.png"
            alt="goose.gifts"
            width={48}
            height={48}
            className="h-12 w-12 transition-transform group-hover:scale-105"
            priority
          />
          <span className="text-2xl font-black tracking-tight">goose.gifts</span>
        </Link>

        <form action="/" method="get" role="search" className="w-full sm:max-w-xl">
          <label htmlFor="site-search" className="sr-only">
            Search gifts
          </label>
          <div className="relative">
            <input
              id="site-search"
              name="q"
              type="search"
              defaultValue={initialQuery}
              placeholder="dad with no spare time"
              className="h-11 w-full rounded-lg border-2 border-zinc-200 bg-white pl-11 pr-24 text-sm text-zinc-950 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <svg
              className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Search
            </button>
          </div>
        </form>
      </div>
    </header>
  );
}
