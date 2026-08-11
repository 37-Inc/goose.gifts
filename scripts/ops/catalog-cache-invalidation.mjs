const DEFAULT_SITE_URL = 'https://www.goose.gifts';

export function canonicalCatalogSiteUrl(value) {
  const url = new URL(value || DEFAULT_SITE_URL);
  if (url.hostname === 'goose.gifts') url.hostname = 'www.goose.gifts';
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export async function invalidateCatalogCaches({
  fetchImpl = fetch,
  secret = process.env.CATALOG_CACHE_REVALIDATE_SECRET,
  siteUrl = process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_SITE_URL,
} = {}) {
  if (!secret) {
    return { ok: false, reason: 'cache_revalidation_not_configured' };
  }

  const response = await fetchImpl(`${canonicalCatalogSiteUrl(siteUrl)}/api/admin/catalog-cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: 'catalog-job' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    return {
      ok: false,
      reason: 'cache_revalidation_failed',
      status: response.status,
    };
  }
  return {
    ok: true,
    status: response.status,
    revalidated: Array.isArray(body.revalidated) ? body.revalidated : [],
  };
}
