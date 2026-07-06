// Admin API response types
export interface AdminApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DashboardStats {
  today: {
    productClicks: number;
    searches: number;
    productsUpdated: number;
  };
  catalog: {
    totalProducts: number;
    activeProducts: number;
    enrichedProducts: number;
    embeddedProducts: number;
    missingEnrichment: number;
  };
  allTime: {
    productClicks: number;
    productImpressions: number;
    averageProductCTR: number;
  };
  clickSources: Array<{
    source: string;
    clicks: number;
  }>;
  topProducts: Array<{
    id: string;
    title: string;
    clickCount: number;
    impressionCount: number;
    ctr: number;
  }>;
  recentProducts: Array<{
    id: string;
    title: string;
    updatedAt: Date;
    clickCount: number;
    impressionCount: number;
  }>;
  systemHealth: {
    database: 'healthy' | 'error';
    lastCatalogUpdate?: Date;
  };
}

// Action types for audit log
export type AdminActionType = 'delete' | 'edit' | 'export' | 'login' | 'logout';

// Error types for error logs
export type ErrorType = 'openai' | 'amazon' | 'etsy' | 'database' | 'auth' | 'other';
