// Product from Amazon/Etsy
export interface Product {
  id: string;
  title: string;
  punnyTitle?: string;
  wittyDescription?: string;
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
