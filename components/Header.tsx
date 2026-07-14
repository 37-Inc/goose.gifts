import Link from 'next/link';
import Image from 'next/image';

export function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-900 transition-colors hover:text-red-700 group">
          <Image
            src="/sillygoose.png"
            alt="goose.gifts"
            width={48}
            height={48}
            className="h-12 w-12 transition-transform group-hover:scale-105"
            priority
          />
          <span className="hidden text-2xl font-black tracking-tight sm:inline">goose.gifts</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold text-zinc-600">
          <Link href="/random-gift" className="whitespace-nowrap transition hover:text-red-700">
            Random gift
          </Link>
          <Link href="/weird-gift-index" className="whitespace-nowrap transition hover:text-red-700">
            Weird Gift Index
          </Link>
          <Link href="/gift-guides" className="whitespace-nowrap transition hover:text-red-700">
            Gift guides
          </Link>
        </nav>
      </div>
    </header>
  );
}
