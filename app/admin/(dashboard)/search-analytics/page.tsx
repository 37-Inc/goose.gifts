import { Suspense } from 'react';
import Link from 'next/link';
import {
  getTopSearchTerms,
  getFailedSearches,
  getPoorResultSearches,
  getSearchAnalyticsSummary,
  getRecentSearches,
} from '@/lib/db/search-analytics';

export const metadata = {
  title: 'Search Analytics - Admin',
};

export const dynamic = 'force-dynamic';

async function SearchAnalyticsContent({ period }: { period: 'day' | 'week' | 'month' }) {
  const [summary, topTerms, failedSearches, poorResults, recentSearches] = await Promise.all([
    getSearchAnalyticsSummary(period),
    getTopSearchTerms(period, 20),
    getFailedSearches(period, 30),
    getPoorResultSearches(period, 30),
    getRecentSearches(50),
  ]);

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg border border-zinc-200">
          <div className="text-2xl font-bold text-zinc-900">{summary.totalSearches.toLocaleString()}</div>
          <div className="text-sm text-zinc-500 mt-1">Total Searches</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-zinc-200">
          <div className="text-2xl font-bold text-zinc-900">{summary.uniqueQueries.toLocaleString()}</div>
          <div className="text-sm text-zinc-500 mt-1">Unique Queries</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-zinc-200">
          <div className="text-2xl font-bold text-zinc-900">{summary.avgResultsPerSearch.toFixed(1)}</div>
          <div className="text-sm text-zinc-500 mt-1">Avg Results/Search</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-zinc-200">
          <div className="text-2xl font-bold text-green-600">{summary.overallClickRate.toFixed(1)}%</div>
          <div className="text-sm text-zinc-500 mt-1">Click-Through Rate</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-zinc-200">
          <div className="text-2xl font-bold text-red-600">{summary.zeroResultRate.toFixed(1)}%</div>
          <div className="text-sm text-zinc-500 mt-1">Zero Results</div>
        </div>
      </div>

      {/* Top Search Terms */}
      <div className="bg-white rounded-lg border border-zinc-200">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Top Search Terms</h2>
          <p className="text-sm text-zinc-500 mt-1">Most popular search queries</p>
        </div>
        <div className="overflow-x-auto">
          {topTerms.length > 0 ? (
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Query</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Avg Results</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Click Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {topTerms.map((term, index) => (
                  <tr key={index} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 text-sm text-zinc-900">{term.query}</td>
                    <td className="px-6 py-4 text-sm text-zinc-900">{term.count}</td>
                    <td className="px-6 py-4 text-sm text-zinc-900">{term.avgResults.toFixed(1)}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`${term.clickRate > 20 ? 'text-green-600' : term.clickRate > 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {term.clickRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-8 text-center text-sm text-zinc-500">No search data for this period</div>
          )}
        </div>
      </div>

      {/* Failed Searches (0 Results) */}
      <div className="bg-white rounded-lg border border-zinc-200">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Failed Searches (Content Gaps)</h2>
          <p className="text-sm text-zinc-500 mt-1">Searches that returned 0 results - consider creating bundles for these</p>
        </div>
        <div className="overflow-x-auto">
          {failedSearches.length > 0 ? (
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Query</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Last Searched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {failedSearches.map((search, index) => (
                  <tr key={index} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 text-sm font-medium text-zinc-900">{search.query}</td>
                    <td className="px-6 py-4 text-sm text-zinc-900">{search.count}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">
                      {new Date(search.lastSearched).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-8 text-center text-sm text-zinc-500">No failed searches - excellent!</div>
          )}
        </div>
      </div>

      {/* Poor Result Searches */}
      <div className="bg-white rounded-lg border border-zinc-200">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Poor Result Quality</h2>
          <p className="text-sm text-zinc-500 mt-1">Searches with low similarity scores (&lt;0.6) - results may not match intent</p>
        </div>
        <div className="overflow-x-auto">
          {poorResults.length > 0 ? (
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Query</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Avg Similarity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {poorResults.map((search, index) => (
                  <tr key={index} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 text-sm font-medium text-zinc-900">{search.query}</td>
                    <td className="px-6 py-4 text-sm text-zinc-900">{search.count}</td>
                    <td className="px-6 py-4 text-sm text-yellow-600">{search.avgSimilarity.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-8 text-center text-sm text-zinc-500">No poor results - all searches return quality matches!</div>
          )}
        </div>
      </div>

      {/* Recent Searches */}
      <div className="bg-white rounded-lg border border-zinc-200">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Recent Searches</h2>
          <p className="text-sm text-zinc-500 mt-1">Last 50 search queries</p>
        </div>
        <div className="overflow-x-auto">
          {recentSearches.length > 0 ? (
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Query</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Results</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Similarity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Clicked</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {recentSearches.map((search) => (
                  <tr key={search.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 text-sm text-zinc-900">{search.query}</td>
                    <td className="px-6 py-4 text-sm text-zinc-900">{search.resultCount}</td>
                    <td className="px-6 py-4 text-sm text-zinc-900">
                      {search.topSimilarity ? parseFloat(search.topSimilarity).toFixed(3) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {search.clicked === 1 ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">
                      {new Date(search.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-8 text-center text-sm text-zinc-500">No recent searches</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function SearchAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period = (params.period as 'day' | 'week' | 'month') || 'week';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Search Analytics</h1>
          <p className="text-zinc-600">Track search queries, identify content gaps, and measure engagement</p>
        </div>
        <Link
          href="/admin"
          className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Period Selector */}
      <div className="mb-6 flex gap-2">
        <Link
          href="?period=day"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            period === 'day'
              ? 'bg-orange-600 text-white'
              : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200'
          }`}
        >
          Last 24 Hours
        </Link>
        <Link
          href="?period=week"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            period === 'week'
              ? 'bg-orange-600 text-white'
              : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200'
          }`}
        >
          Last 7 Days
        </Link>
        <Link
          href="?period=month"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            period === 'month'
              ? 'bg-orange-600 text-white'
              : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200'
          }`}
        >
          Last 30 Days
        </Link>
      </div>

      <Suspense fallback={<div className="text-center py-12 text-zinc-500">Loading analytics...</div>}>
        <SearchAnalyticsContent period={period} />
      </Suspense>
    </div>
  );
}
