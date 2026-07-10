'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@/components/admin/Card';
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Failed to load dashboard</h2>
      </div>
    );
  }

  const enrichmentRate = stats.catalog.activeProducts > 0
    ? Math.round((stats.catalog.enrichedProducts / stats.catalog.activeProducts) * 1000) / 10
    : 0;
  const sourceClickTotal = stats.clickSources.reduce((total, source) => total + source.clicks, 0);
  const acquisitionClickTotal = stats.acquisitionSources.reduce((total, source) => total + source.clicks, 0);

  const formatSource = (source: string) => source
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-600">Catalog health and product search performance</p>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Today</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Searches</div>
              <div className="text-3xl font-bold text-blue-600">{stats.today.searches}</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Product Clicks</div>
              <div className="text-3xl font-bold text-purple-600">{stats.today.productClicks}</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Products Updated</div>
              <div className="text-3xl font-bold text-green-600">{stats.today.productsUpdated}</div>
            </CardBody>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Catalog Health</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Total Products</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.catalog.totalProducts.toLocaleString()}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Active Products</div>
              <div className="text-3xl font-bold text-gray-900">
                {stats.catalog.activeProducts.toLocaleString()}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Enriched</div>
              <div className="text-3xl font-bold text-green-600">
                {stats.catalog.enrichedProducts.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-gray-500">{enrichmentRate.toFixed(1)}% of active</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Embedded</div>
              <div className="text-3xl font-bold text-blue-600">
                {stats.catalog.embeddedProducts.toLocaleString()}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Missing Enrichment</div>
              <div className="text-3xl font-bold text-orange-600">
                {stats.catalog.missingEnrichment.toLocaleString()}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Product Performance</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Total Product Clicks</div>
              <div className="text-3xl font-bold text-purple-600">
                {stats.allTime.productClicks.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-gray-500">Outbound affiliate clicks</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Product Impressions</div>
              <div className="text-3xl font-bold text-blue-600">
                {stats.allTime.productImpressions.toLocaleString()}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="mb-1 text-sm font-medium text-gray-600">Average Product CTR</div>
              <div className="text-3xl font-bold text-green-600">
                {stats.allTime.averageProductCTR.toFixed(2)}%
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Click Sources"
          subtitle="Outbound product-click mix by surface"
        />
        <CardBody className="p-0">
          <div className="divide-y divide-gray-200">
            {stats.clickSources.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                Source mix will appear after product clicks are tracked.
              </div>
            ) : (
              stats.clickSources.map((source) => {
                const share = sourceClickTotal > 0
                  ? Math.round((source.clicks / sourceClickTotal) * 1000) / 10
                  : 0;

                return (
                  <div key={source.source} className="px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900">{formatSource(source.source)}</div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-purple-500"
                            style={{ width: `${Math.min(share, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-purple-600">{source.clicks}</div>
                        <div className="text-xs text-gray-500">{share.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Acquisition Sources"
            subtitle="90-day product clicks by referrer or UTM source"
          />
          <CardBody className="p-0">
            <div className="divide-y divide-gray-200">
              {stats.acquisitionSources.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  Acquisition sources will appear after attributed product clicks.
                </div>
              ) : (
                stats.acquisitionSources.map((source) => {
                  const share = acquisitionClickTotal > 0
                    ? Math.round((source.clicks / acquisitionClickTotal) * 1000) / 10
                    : 0;

                  return (
                    <div key={source.source} className="px-6 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-gray-900">{source.source}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            Latest {source.latestClickAt ? formatDate(source.latestClickAt) : 'unknown'}
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${Math.min(share, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-blue-600">{source.clicks}</div>
                          <div className="text-xs text-gray-500">{share.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Campaign Clicks"
            subtitle="90-day outbound clicks carrying UTM values"
          />
          <CardBody className="p-0">
            <div className="divide-y divide-gray-200">
              {stats.campaignClicks.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  Campaign cohorts will appear after UTM-tagged traffic clicks products.
                </div>
              ) : (
                stats.campaignClicks.map((campaign) => (
                  <div
                    key={`${campaign.source}:${campaign.medium}:${campaign.campaign}`}
                    className="px-6 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-gray-900">
                          {campaign.source} / {campaign.medium}
                        </div>
                        <div className="mt-1 truncate text-sm text-gray-600">
                          {campaign.campaign}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Latest {campaign.latestClickAt ? formatDate(campaign.latestClickAt) : 'unknown'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-green-600">{campaign.clicks}</div>
                        <div className="text-xs text-gray-500">clicks</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Top Products"
          subtitle="Products with the most recorded outbound clicks"
        />
        <CardBody className="p-0">
          <div className="divide-y divide-gray-200">
            {stats.topProducts.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                Product click data will appear here after shoppers click results.
              </div>
            ) : (
              stats.topProducts.map((product, index) => (
                <div key={product.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100">
                        <span className="text-sm font-semibold text-purple-600">#{index + 1}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-medium text-gray-900">{product.title}</h3>
                        <div className="mt-1 text-xs text-gray-500">{product.impressionCount} impressions</div>
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Clicks</div>
                        <div className="text-lg font-semibold text-purple-600">{product.clickCount}</div>
                      </div>
                      <div className="min-w-[60px] text-right">
                        <div className="text-sm text-gray-600">CTR</div>
                        <div className="text-lg font-semibold text-gray-900">{product.ctr.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent Catalog Updates" subtitle="Most recently updated products" />
        <CardBody className="p-0">
          <div className="divide-y divide-gray-200">
            {stats.recentProducts.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">No catalog products found</div>
            ) : (
              stats.recentProducts.map((product) => (
                <div key={product.id} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium text-gray-900">{product.title}</h3>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        <code className="font-mono">{product.id}</code>
                        <span>{formatDate(product.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <div className="text-sm text-gray-600">Clicks</div>
                        <div className="text-lg font-semibold text-purple-600">{product.clickCount}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Impressions</div>
                        <div className="text-lg font-semibold text-blue-600">{product.impressionCount}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="System Health" />
        <CardBody>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full ${
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
                  className={`h-3 w-3 rounded-full ${
                    stats.systemHealth.lastCatalogUpdate ? 'bg-green-500' : 'bg-yellow-500'
                  }`}
                />
                <span className="font-medium text-gray-900">Last Catalog Update</span>
              </div>
              <span className="text-sm text-gray-600">
                {stats.systemHealth.lastCatalogUpdate
                  ? formatDate(stats.systemHealth.lastCatalogUpdate)
                  : 'No catalog updates'}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Quick Actions" />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              onClick={() => router.push('/admin/products')}
              className="rounded-lg border-2 border-blue-200 bg-blue-50 px-6 py-4 text-left transition-colors hover:bg-blue-100"
            >
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <div>
                  <div className="font-semibold text-gray-900">Manage Products</div>
                  <div className="text-sm text-gray-600">Review active catalog items</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push('/admin/search-analytics')}
              className="rounded-lg border-2 border-orange-200 bg-orange-50 px-6 py-4 text-left transition-colors hover:bg-orange-100"
            >
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <div>
                  <div className="font-semibold text-gray-900">Search Analytics</div>
                  <div className="text-sm text-gray-600">Track queries and catalog gaps</div>
                </div>
              </div>
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
