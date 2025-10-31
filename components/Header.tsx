import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-zinc-900 hover:text-[#f59e42] transition-colors group">
            <img
              src="/sillygoose.png"
              alt="Silly Goose"
              className="w-10 h-10 transition-transform group-hover:scale-105"
            />
            <span className="text-xl font-bold">goose.gifts</span>
          </Link>

          {/* Search Icon */}
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg transition-colors"
            aria-label="Search gift bundles"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden sm:inline">Search</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
