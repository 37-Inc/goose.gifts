import type { GiftBundle } from '@/lib/db/schema';

// Admin API response types
export interface AdminApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Bundle list filters
export interface BundleFilters {
  humorStyle?: string;
  dateFrom?: string;
  dateTo?: string;
  minViews?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'viewCount';
  sortOrder?: 'asc' | 'desc';
}

// Paginated bundle list response
export interface BundleListResponse {
  bundles: GiftBundle[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Dashboard stats
export interface DashboardStats {
  today: {
    bundlesGenerated: number;
    totalViews: number;
    totalClicks: number;
    bundlesDeleted: number;
  };
  allTime: {
    totalBundles: number;
    totalViews: number;
    totalClicks: number;
    averageViewsPerBundle: number;
    averageClicksPerBundle: number;
  };
  recentBundles: Array<{
    slug: string;
    title: string;
    createdAt: Date;
    viewCount: number;
  }>;
  systemHealth: {
    database: 'healthy' | 'error';
    lastGeneration?: Date;
  };
}

// Analytics data
export interface AnalyticsData {
  totalBundles: number;
  totalViews: number;
  totalClicks: number;
  averageViewsPerBundle: number;
  averageClicksPerBundle: number;
  topBundles: Array<{
    slug: string;
    title: string;
    viewCount: number;
    clickCount: number;
    createdAt: Date;
  }>;
  humorStyleBreakdown: Array<{
    style: string;
    count: number;
    percentage: number;
  }>;
  dailyStats: Array<{
    date: string;
    bundles: number;
    views: number;
    clicks: number;
  }>;
}

// Action types for audit log
export type AdminActionType = 'delete' | 'edit' | 'export' | 'login' | 'logout';

// Error types for error logs
export type ErrorType = 'openai' | 'amazon' | 'etsy' | 'database' | 'auth' | 'other';
