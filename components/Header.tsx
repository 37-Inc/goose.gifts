import Link from 'next/link';
import Image from 'next/image';

export function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-900 transition-colors hover:text-red-700 group">
          <Image
            src="/sillygoose.png"
            alt="goose.gifts"
            width={48}
            height={48}
            className="h-10 w-10 transition-transform group-hover:scale-105 sm:h-12 sm:w-12"
            priority
          />
          <span className="hidden text-2xl font-black tracking-tight sm:inline">goose.gifts</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm font-semibold text-zinc-600 sm:gap-5" aria-label="Primary navigation">
          <Link href="/#catalog-search-input" className="whitespace-nowrap transition hover:text-red-700">
            Search
          </Link>
          <Link href="/random-gift" className="whitespace-nowrap transition hover:text-red-700">
            Random
          </Link>
          <Link href="/gift-guides" className="whitespace-nowrap transition hover:text-red-700">
            Guides
          </Link>
        </nav>
      </div>
    </header>
  );
}
