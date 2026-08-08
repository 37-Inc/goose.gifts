const TRACKING_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export function slugifyGiftTitle(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');

  return slug || 'ridiculous-gift';
}

export function getGiftPath(slug: string): string {
  return `/gifts/${encodeURIComponent(slug)}`;
}

export function getLegacyGiftRedirectPath(
  slug: string,
  searchParams: Record<string, string | string[] | undefined>
): string {
  const tracking = new URLSearchParams();

  for (const key of TRACKING_KEYS) {
    const rawValue = searchParams[key];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value) {
      tracking.set(key, value);
    }
  }

  const query = tracking.toString();
  return `${getGiftPath(slug)}${query ? `?${query}` : ''}`;
}

export function getEditorialParagraphs(writeup?: string): string[] {
  return (writeup || '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export const INDEXABLE_EDITORIAL_STATUSES = ['generated_ready', 'manual_locked'] as const;
export const PURCHASABLE_AVAILABILITY_STATUSES = [
  'IN_STOCK',
  'IN_STOCK_SCARCE',
  'INSTOCKSCARCE',
  'AVAILABLE_DATE',
  'LEADTIME',
  'PREORDER',
] as const;

export function isPurchasableAvailability(status?: string): boolean {
  return PURCHASABLE_AVAILABILITY_STATUSES.includes(
    String(status || '').toUpperCase() as typeof PURCHASABLE_AVAILABILITY_STATUSES[number]
  );
}

function editorialWordCount(editorial: string): number {
  return editorial.split(/\s+/).filter(Boolean).length;
}

export function hasIndexableGiftEditorial(product: ProductEditorial, now: Date = new Date()): boolean {
  const editorial = product.editorialWriteup?.trim() || '';
  const verifiedAt = product.availabilityCheckedAt || product.lastVerifiedAt;
  const verifiedTime = verifiedAt ? new Date(verifiedAt).getTime() : Number.NaN;
  const maxVerificationAgeMs = 35 * 24 * 60 * 60 * 1000;
  const freshVerification = Number.isFinite(verifiedTime)
    && now.getTime() - verifiedTime <= maxVerificationAgeMs;
  const approved = INDEXABLE_EDITORIAL_STATUSES.includes(
    String(product.editorialStatus || '') as typeof INDEXABLE_EDITORIAL_STATUSES[number]
  );
  const reviewedQuality = Number(product.editorialQualityScore || 0) >= 0.8;
  const substantive = Array.from(editorial).length >= 500
    && editorialWordCount(editorial) >= 90
    && getEditorialParagraphs(editorial).length >= 2;
  const currentFacts = Boolean(product.sourceFactsHash)
    && product.sourceFactsHash === product.editorialSourceHash;

  return product.isActive !== false
    && !product.duplicateOfProductId
    && isPurchasableAvailability(product.availabilityStatus)
    && freshVerification
    && approved
    && reviewedQuality
    && currentFacts
    && substantive;
}

interface ProductEditorial {
  editorialWriteup?: string;
  isActive?: boolean;
  duplicateOfProductId?: string;
  availabilityStatus?: string;
  availabilityCheckedAt?: Date | string;
  lastVerifiedAt?: Date | string;
  editorialStatus?: string;
  editorialQualityScore?: number;
  sourceFactsHash?: string;
  editorialSourceHash?: string;
}
