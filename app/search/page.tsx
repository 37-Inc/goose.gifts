import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';
import { Header } from '@/components/Header';

export const metadata = {
  title: 'Search Gift Bundles - goose.gifts',
  description: 'Search through our curated gift bundles and find the perfect gift.',
};

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-zinc-50/30 to-white">
      {/* Header */}
      <Header />

      {/* Search Section */}
      <div className="container mx-auto px-4 pt-16 pb-12">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-zinc-900 mb-4">
              Search Gift Bundles
            </h1>
            <p className="text-base text-zinc-600 font-light">
              Find the perfect gift from our curated collection
            </p>
          </div>

          {/* Search Bar */}
          <div className="mb-12">
            <SearchBar />
          </div>

          {/* Tips */}
          <div className="bg-white rounded-xl p-8 shadow-sm border border-zinc-100">
            <h2 className="text-lg font-medium text-zinc-900 mb-4">Search tips</h2>
            <ul className="space-y-3 text-sm text-zinc-600">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>Try searching by recipient (e.g., "mom", "teacher", "best friend")</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>Search by occasion (e.g., "birthday", "christmas", "graduation")</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>Look for interests or hobbies (e.g., "gardening", "cooking", "gaming")</span>
              </li>
            </ul>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <p className="text-sm text-zinc-500 mb-4">
              Can't find what you're looking for?
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Create Custom Gift Bundle
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
