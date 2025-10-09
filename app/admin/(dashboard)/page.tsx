'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/admin/Card';
import { useToast } from '@/components/admin/Toast';
import type { DashboardStats } from '@/lib/admin/types';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/stats');
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      } else {
        showToast('error', data.error || 'Failed to fetch stats');
      }
    } catch (error) {
      showToast('error', 'An error occurred while fetching stats');
      console.error('Stats fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Failed to load dashboard</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to the goose.gifts admin portal</p>
      </div>

      {/* Today Stats */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Today&apos;s Activity</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Bundles Generated</div>
              <div className="text-3xl font-bold text-blue-600">
                {stats.today.bundlesGenerated}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Total Views</div>
              <div className="text-3xl font-bold text-green-600">{stats.today.totalViews}</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Total Clicks</div>
              <div className="text-3xl font-bold text-orange-600">{stats.today.totalClicks}</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Bundles Deleted</div>
              <div className="text-3xl font-bold text-red-600">
                {stats.today.bundlesDeleted}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* All-Time Stats */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">All-Time Stats</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Total Bundles</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.allTime.totalBundles.toLocaleString()}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Total Views</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.allTime.totalViews.toLocaleString()}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Total Clicks</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.allTime.totalClicks.toLocaleString()}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Avg Views per Bundle</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.allTime.averageViewsPerBundle}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-sm font-medium text-gray-600 mb-1">Avg Clicks per Bundle</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.allTime.averageClicksPerBundle}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader title="Recent Bundles" subtitle="Last 10 generated bundles" />
        <CardBody className="p-0">
          <div className="divide-y divide-gray-200">
            {stats.recentBundles.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">No bundles generated yet</div>
            ) : (
              stats.recentBundles.map((bundle) => (
                <div
                  key={bundle.slug}
                  onClick={() => router.push(`/admin/bundles/${bundle.slug}`)}
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{bundle.title}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <code className="text-xs text-gray-500 font-mono">{bundle.slug}</code>
                        <span className="text-xs text-gray-400">
                          {formatDate(bundle.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Views</div>
                        <div className="text-lg font-semibold text-blue-600">
                          {bundle.viewCount}
                        </div>
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      {/* System Health */}
      <Card>
        <CardHeader title="System Health" />
        <CardBody>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    stats.systemHealth.database === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="font-medium text-gray-900">Database</span>
              </div>
              <span
                className={`text-sm ${
                  stats.systemHealth.database === 'healthy'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {stats.systemHealth.database === 'healthy' ? 'Healthy' : 'Error'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    stats.systemHealth.lastGeneration ? 'bg-green-500' : 'bg-yellow-500'
                  }`}
                />
                <span className="font-medium text-gray-900">Last Generation</span>
              </div>
              <span className="text-sm text-gray-600">
                {stats.systemHealth.lastGeneration
                  ? formatDate(stats.systemHealth.lastGeneration)
                  : 'No recent activity'}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader title="Quick Actions" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => router.push('/admin/bundles')}
              className="px-6 py-4 bg-blue-50 border-2 border-blue-200 rounded-lg text-left hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
                <div>
                  <div className="font-semibold text-gray-900">Manage Bundles</div>
                  <div className="text-sm text-gray-600">View and edit all gift bundles</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push('/admin/analytics')}
              className="px-6 py-4 bg-green-50 border-2 border-green-200 rounded-lg text-left hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <div>
                  <div className="font-semibold text-gray-900">View Analytics</div>
                  <div className="text-sm text-gray-600">See detailed performance metrics</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push('/admin/search-analytics')}
              className="px-6 py-4 bg-orange-50 border-2 border-orange-200 rounded-lg text-left hover:bg-orange-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg
                  className="w-6 h-6 text-orange-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <div>
                  <div className="font-semibold text-gray-900">Search Analytics</div>
                  <div className="text-sm text-gray-600">Track search queries and content gaps</div>
                </div>
              </div>
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
