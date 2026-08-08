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

export function hasIndexableGiftEditorial(product: Pick<ProductEditorial, 'editorialWriteup'>): boolean {
  return (product.editorialWriteup?.trim().length || 0) >= 500;
}

interface ProductEditorial {
  editorialWriteup?: string;
}
