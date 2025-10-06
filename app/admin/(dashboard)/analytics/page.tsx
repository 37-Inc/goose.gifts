'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/admin/Card';
import { useToast } from '@/components/admin/Toast';
import type { AnalyticsData } from '@/lib/admin/types';

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/analytics');
      const data = await response.json();

      if (data.success) {
        setAnalytics(data.data);
      } else {
        showToast('error', data.error || 'Failed to fetch analytics');
      }
    } catch (error) {
      showToast('error', 'An error occurred while fetching analytics');
      console.error('Analytics fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Failed to load analytics</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600 mt-1">Performance insights and metrics</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-600 mb-1">Total Bundles</div>
            <div className="text-3xl font-bold text-gray-900">
              {analytics.totalBundles.toLocaleString()}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-600 mb-1">Total Views</div>
            <div className="text-3xl font-bold text-gray-900">
              {analytics.totalViews.toLocaleString()}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-600 mb-1">Avg Views per Bundle</div>
            <div className="text-3xl font-bold text-gray-900">
              {analytics.averageViewsPerBundle}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Top Bundles */}
      <Card>
        <CardHeader title="Top Performing Bundles" subtitle="Most viewed bundles of all time" />
        <CardBody className="p-0">
          <div className="divide-y divide-gray-200">
            {analytics.topBundles.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">No bundles yet</div>
            ) : (
              analytics.topBundles.map((bundle, index) => (
                <div
                  key={bundle.slug}
                  onClick={() => router.push(`/admin/bundles/${bundle.slug}`)}
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-700 font-bold rounded-full">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{bundle.title}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <code className="text-xs text-gray-500 font-mono">{bundle.slug}</code>
                        <span className="text-xs text-gray-400">
                          Created {formatDate(bundle.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {bundle.viewCount.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">views</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      {/* Humor Style Breakdown */}
      <Card>
        <CardHeader
          title="Humor Style Distribution"
          subtitle="Breakdown of bundles by humor style"
        />
        <CardBody>
          <div className="space-y-4">
            {analytics.humorStyleBreakdown.length === 0 ? (
              <div className="text-center text-gray-500 py-4">No data available</div>
            ) : (
              analytics.humorStyleBreakdown.map((item) => (
                <div key={item.style}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900 capitalize">
                        {item.style.replace('-', ' ')}
                      </span>
                      <span className="text-sm text-gray-500">
                        {item.count.toLocaleString()} bundles
                      </span>
                    </div>
                    <span className="font-semibold text-gray-900">{item.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      {/* Daily Stats */}
      <Card>
        <CardHeader
          title="Activity Over Time"
          subtitle="Daily bundles and views for the last 30 days"
        />
        <CardBody>
          {analytics.dailyStats.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Bundles Generated
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total Views
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Avg Views
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {analytics.dailyStats.map((stat) => {
                    const avgViews =
                      stat.bundles > 0 ? Math.round(stat.views / stat.bundles) : 0;

                    return (
                      <tr key={stat.date} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {new Date(stat.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          {stat.bundles}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {stat.views}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {avgViews}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader title="Summary Insights" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Growth Trend</h3>
                  <p className="text-sm text-gray-700">
                    {analytics.totalBundles > 0
                      ? `On average, each bundle gets ${analytics.averageViewsPerBundle} views`
                      : 'No data yet'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Top Style</h3>
                  <p className="text-sm text-gray-700">
                    {analytics.humorStyleBreakdown.length > 0
                      ? `${analytics.humorStyleBreakdown[0].style.replace('-', ' ')} is most popular (${analytics.humorStyleBreakdown[0].percentage}%)`
                      : 'No data yet'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
