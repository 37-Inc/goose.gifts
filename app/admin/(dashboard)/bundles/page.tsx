'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Pagination } from '@/components/admin/Table';
import { Button } from '@/components/admin/Button';
import { ConfirmModal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/Toast';
import type { GiftBundle } from '@/lib/db/schema';
import type { BundleListResponse } from '@/lib/admin/types';

export default function AdminBundlesPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [bundles, setBundles] = useState<GiftBundle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [filters, setFilters] = useState({
    humorStyle: '',
    dateFrom: '',
    dateTo: '',
    minViews: '',
    search: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    slug: string | null;
    reason: string;
    isDeleting: boolean;
  }>({
    isOpen: false,
    slug: null,
    reason: '',
    isDeleting: false,
  });

  const fetchBundles = useCallback(async (page: number = pagination.page) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      });

      if (filters.humorStyle) params.append('humorStyle', filters.humorStyle);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.minViews) params.append('minViews', filters.minViews);
      if (filters.search) params.append('search', filters.search);

      const response = await fetch(`/api/admin/bundles?${params}`);
      const data = await response.json();

      if (data.success) {
        const result = data.data as BundleListResponse;
        setBundles(result.bundles);
        setPagination(result.pagination);
      } else {
        showToast('error', data.error || 'Failed to fetch bundles');
      }
    } catch (error) {
      showToast('error', 'An error occurred while fetching bundles');
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, filters.sortBy, filters.sortOrder, filters.humorStyle, filters.dateFrom, filters.dateTo, filters.minViews, filters.search, showToast]);

  useEffect(() => {
    fetchBundles(1);
  }, [fetchBundles]);

  const handleDelete = async () => {
    if (!deleteModal.slug) return;

    setDeleteModal((prev) => ({ ...prev, isDeleting: true }));

    try {
      const response = await fetch(`/api/admin/bundles/${deleteModal.slug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteModal.reason }),
      });

      const data = await response.json();

      if (data.success) {
        showToast('success', 'Bundle deleted successfully');
        setDeleteModal({ isOpen: false, slug: null, reason: '', isDeleting: false });
        fetchBundles();
      } else {
        showToast('error', data.error || 'Failed to delete bundle');
        setDeleteModal((prev) => ({ ...prev, isDeleting: false }));
      }
    } catch (error) {
      showToast('error', 'An error occurred while deleting the bundle');
      console.error('Delete error:', error);
      setDeleteModal((prev) => ({ ...prev, isDeleting: false }));
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFirstGiftTitle = (bundle: GiftBundle) => {
    try {
      const giftIdeas = bundle.giftIdeas as Array<{ title: string }>;
      return giftIdeas && giftIdeas.length > 0 ? giftIdeas[0].title : 'Untitled';
    } catch {
      return 'Untitled';
    }
  };

  const columns = [
    {
      key: 'slug',
      header: 'Slug',
      width: '200px',
      render: (bundle: GiftBundle) => (
        <div className="font-mono text-xs text-gray-600 truncate max-w-[180px]">
          {bundle.slug}
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (bundle: GiftBundle) => (
        <div>
          <div className="font-medium text-gray-900">
            {bundle.seoTitle || getFirstGiftTitle(bundle)}
          </div>
          <div className="text-xs text-gray-500 truncate max-w-[300px]">
            {bundle.recipientDescription}
          </div>
        </div>
      ),
    },
    {
      key: 'humorStyle',
      header: 'Humor Style',
      width: '120px',
      render: (bundle: GiftBundle) => (
        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
          {bundle.humorStyle}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: '120px',
      render: (bundle: GiftBundle) => (
        <div className="text-sm text-gray-600">{formatDate(bundle.createdAt)}</div>
      ),
    },
    {
      key: 'viewCount',
      header: 'Views',
      width: '80px',
      render: (bundle: GiftBundle) => (
        <div className="text-sm font-medium text-gray-900">{bundle.viewCount}</div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '180px',
      render: (bundle: GiftBundle) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/admin/bundles/${bundle.slug}`);
            }}
          >
            View
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteModal({
                isOpen: true,
                slug: bundle.slug,
                reason: '',
                isDeleting: false,
              });
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Gift Bundles</h1>
        <p className="text-gray-600 mt-1">Manage all generated gift bundles</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Search slug or title..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Humor Style
            </label>
            <select
              value={filters.humorStyle}
              onChange={(e) => setFilters((prev) => ({ ...prev, humorStyle: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Styles</option>
              <option value="dad-joke">Dad Joke</option>
              <option value="office-safe">Office-Safe</option>
              <option value="edgy">Edgy</option>
              <option value="pg">PG</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Views
            </label>
            <input
              type="number"
              value={filters.minViews}
              onChange={(e) => setFilters((prev) => ({ ...prev, minViews: e.target.value }))}
              placeholder="e.g., 10"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sort By
            </label>
            <select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-');
                setFilters((prev) => ({ ...prev, sortBy, sortOrder }));
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="createdAt-desc">Newest First</option>
              <option value="createdAt-asc">Oldest First</option>
              <option value="viewCount-desc">Most Views</option>
              <option value="viewCount-asc">Least Views</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date From
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date To
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setFilters({
                humorStyle: '',
                dateFrom: '',
                dateTo: '',
                minViews: '',
                search: '',
                sortBy: 'createdAt',
                sortOrder: 'desc',
              })
            }
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={bundles}
        onRowClick={(bundle) => router.push(`/admin/bundles/${bundle.slug}`)}
        isLoading={isLoading}
        emptyMessage="No bundles found. Try adjusting your filters."
      />

      {/* Pagination */}
      {!isLoading && pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={fetchBundles}
          totalItems={pagination.total}
          itemsPerPage={pagination.limit}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() =>
          setDeleteModal({ isOpen: false, slug: null, reason: '', isDeleting: false })
        }
        onConfirm={handleDelete}
        title="Delete Bundle"
        message="Are you sure you want to delete this bundle? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        isLoading={deleteModal.isDeleting}
      />
    </div>
  );
}
