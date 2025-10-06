'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/admin/Button';
import { Card, CardHeader, CardBody } from '@/components/admin/Card';
import { ConfirmModal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/Toast';
import type { GiftBundle } from '@/lib/db/schema';
import type { GiftIdea, Product } from '@/lib/types';

export default function AdminBundleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { showToast } = useToast();

  const [bundle, setBundle] = useState<GiftBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    isDeleting: false,
  });

  const fetchBundle = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/bundles/${resolvedParams.slug}`);
      const data = await response.json();

      if (data.success) {
        setBundle(data.data);
        setEditedTitle(data.data.seoTitle || '');
        setEditedDescription(data.data.seoDescription || '');
      } else {
        showToast('error', data.error || 'Failed to fetch bundle');
      }
    } catch (error) {
      showToast('error', 'An error occurred while fetching the bundle');
      console.error('Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [resolvedParams.slug, showToast]);

  useEffect(() => {
    fetchBundle();
  }, [fetchBundle]);

  const handleSave = async () => {
    if (!bundle) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/bundles/${bundle.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seoTitle: editedTitle,
          seoDescription: editedDescription,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showToast('success', 'Bundle updated successfully');
        setBundle(data.data);
        setIsEditing(false);
      } else {
        showToast('error', data.error || 'Failed to update bundle');
      }
    } catch (error) {
      showToast('error', 'An error occurred while updating the bundle');
      console.error('Update error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!bundle) return;

    setDeleteModal((prev) => ({ ...prev, isDeleting: true }));

    try {
      const response = await fetch(`/api/admin/bundles/${bundle.slug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Deleted from detail view' }),
      });

      const data = await response.json();

      if (data.success) {
        showToast('success', 'Bundle deleted successfully');
        router.push('/admin/bundles');
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('success', 'Copied to clipboard');
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading bundle...</p>
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Bundle not found</h2>
        <Button className="mt-4" onClick={() => router.push('/admin/bundles')}>
          Back to Bundles
        </Button>
      </div>
    );
  }

  const giftIdeas = bundle.giftIdeas as GiftIdea[];
  const permalinkUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${bundle.slug}`;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/bundles')}>
            ← Back to Bundles
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            {bundle.seoTitle || 'Untitled Bundle'}
          </h1>
          <p className="text-gray-600 mt-1">Bundle Details</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => window.open(`/${bundle.slug}`, '_blank')}
          >
            Preview
          </Button>
          {isEditing ? (
            <>
              <Button variant="secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} isLoading={isSaving}>
                Save Changes
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
              <Button
                variant="danger"
                onClick={() => setDeleteModal({ isOpen: true, isDeleting: false })}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader title="Metadata" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Slug</label>
              <div className="flex gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono">
                  {bundle.slug}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(bundle.slug)}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Permalink URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={permalinkUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(permalinkUrl)}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Humor Style
              </label>
              <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium inline-block">
                {bundle.humorStyle}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price Range
              </label>
              <span className="px-3 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm inline-block">
                ${bundle.minPrice} - ${bundle.maxPrice}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Created</label>
              <div className="text-sm text-gray-900">{formatDate(bundle.createdAt)}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Views</label>
              <div className="text-2xl font-bold text-blue-600">{bundle.viewCount}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Clicks</label>
              <div className="text-2xl font-bold text-orange-600">{bundle.clickCount || 0}</div>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Description
            </label>
            <p className="text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-300">
              {bundle.recipientDescription}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* SEO */}
      <Card>
        <CardHeader title="SEO Metadata" subtitle={isEditing ? 'Edit SEO information' : ''} />
        <CardBody>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SEO Title
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={60}
                />
              ) : (
                <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                  {bundle.seoTitle || 'Not set'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SEO Description
              </label>
              {isEditing ? (
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  maxLength={160}
                />
              ) : (
                <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                  {bundle.seoDescription || 'Not set'}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Gift Ideas */}
      <Card>
        <CardHeader
          title="Gift Ideas"
          subtitle={`${giftIdeas.length} gift ${giftIdeas.length === 1 ? 'idea' : 'ideas'}`}
        />
        <CardBody className="space-y-6">
          {giftIdeas.map((idea, index) => (
            <div key={idea.id} className="border-l-4 border-blue-500 pl-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900">{idea.title}</h3>
                <span className="text-sm text-gray-500">Idea {index + 1}</span>
              </div>
              <p className="text-gray-700 italic mb-3">{idea.tagline}</p>
              <p className="text-gray-600 mb-4">{idea.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(idea.products as Product[]).map((product) => (
                  <div
                    key={product.id}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex gap-4">
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          className="w-20 h-20 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 text-sm truncate">
                          {product.title}
                        </h4>
                        <p className="text-lg font-bold text-green-600 mt-1">
                          ${product.price}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                            {product.source}
                          </span>
                          {product.rating && (
                            <span className="text-xs text-gray-600">
                              ⭐ {product.rating}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, isDeleting: false })}
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
