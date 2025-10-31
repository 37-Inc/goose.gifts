'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody } from '@/components/admin/Card';
import { useToast } from '@/components/admin/Toast';

interface ProductStats {
  id: string;
  title: string;
  source: string;
  price: string;
  clickCount: number;
  impressionCount: number;
  ctr: number;
  lastClickedAt: string | null;
}

export default function AdminProductsPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<ProductStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'clicks' | 'ctr' | 'impressions'>('clicks');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/products');
      const data = await response.json();

      if (data.success) {
        setProducts(data.data);
      } else {
        showToast('error', data.error || 'Failed to fetch products');
      }
    } catch (error) {
      showToast('error', 'An error occurred while fetching products');
      console.error('Products fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'clicks':
        return b.clickCount - a.clickCount;
      case 'ctr':
        return b.ctr - a.ctr;
      case 'impressions':
        return b.impressionCount - a.impressionCount;
      default:
        return 0;
    }
  });

  const topProducts = sortedProducts.slice(0, 50);

  const totalClicks = products.reduce((sum, p) => sum + p.clickCount, 0);
  const totalImpressions = products.reduce((sum, p) => sum + p.impressionCount, 0);
  const averageCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Product Analytics</h1>
        <p className="text-gray-600 mt-1">Track product performance and click-through rates</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-600 mb-1">Total Products</div>
            <div className="text-3xl font-bold text-gray-900">
              {products.length.toLocaleString()}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-600 mb-1">Total Clicks</div>
            <div className="text-3xl font-bold text-blue-600">
              {totalClicks.toLocaleString()}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-600 mb-1">Total Impressions</div>
            <div className="text-3xl font-bold text-green-600">
              {totalImpressions.toLocaleString()}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-600 mb-1">Average CTR</div>
            <div className="text-3xl font-bold text-orange-600">
              {averageCTR.toFixed(2)}%
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader title="Top Performing Products" subtitle="Sorted by performance metrics" />
        <CardBody className="p-0">
          {/* Sort Controls */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Sort by:</span>
              <button
                onClick={() => setSortBy('clicks')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  sortBy === 'clicks'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                Clicks
              </button>
              <button
                onClick={() => setSortBy('ctr')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  sortBy === 'ctr'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                CTR
              </button>
              <button
                onClick={() => setSortBy('impressions')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  sortBy === 'impressions'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                Impressions
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clicks
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Impressions
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CTR
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Click
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topProducts.map((product, index) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      #{index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                      <div className="truncate">{product.title}</div>
                      <div className="text-xs text-gray-500 mt-1">${product.price}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        product.source === 'amazon'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {product.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-blue-600">
                      {product.clickCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {product.impressionCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <span className={`font-medium ${
                        product.ctr > 5 ? 'text-green-600' :
                        product.ctr > 2 ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {product.ctr.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {product.lastClickedAt
                        ? new Date(product.lastClickedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
