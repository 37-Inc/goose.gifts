// Product from Amazon/Etsy
export interface Product {
  id: string;
  publicId?: string;
  slug?: string;
  title: string;
  punnyTitle?: string;
  wittyDescription?: string;
  editorialWriteup?: string;
  sourceFacts?: Record<string, unknown>;
  sourceFactsHash?: string;
  editorialSourceHash?: string;
  availabilityStatus?: string;
  availabilityCheckedAt?: Date | string;
  lastVerifiedAt?: Date | string;
  editorialStatus?: string;
  editorialQualityScore?: number;
  editorialModel?: string;
  editorialPromptVersion?: string;
  editorialGeneratedAt?: Date | string;
  editorialBlockReason?: string;
  duplicateOfProductId?: string;
  contentUpdatedAt?: Date | string;
  humorTags?: string[];
  qualityScore?: number;
  sourceQuery?: string;
  isActive?: boolean;
  price: number;
  currency: string;
  imageUrl: string;
  affiliateUrl: string;
  source: 'amazon' | 'etsy';
  rating?: number;
  reviewCount?: number;
}

export interface ProductSearchResult extends Product {
  similarity: number;
  rankScore: number;
  matchType: 'semantic' | 'keyword';
}
