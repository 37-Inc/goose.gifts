import type { PublicCatalogProduct } from '../../lib/catalog/types.ts';
import { catalogDeadline, persistentPublicProduct, resolvePublicProduct } from '../../lib/catalog/display.ts';
import type { ProductSearchResult } from '../../lib/types.ts';
import { isCatalogDisplayEligibleProduct, suppressNearDuplicateProducts } from '../../lib/db/product-scoring.ts';
import type { SearchAdapters, SemanticBudgetScope, SiteEnv } from './bindings.ts';
import { semanticBudgetConfig, semanticTokenUpperBound } from './semantic-budget.ts';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
const CACHE_MS = 5 * 60_000;
const MAX_STATE_ENTRIES = 256;
type SearchResult = ProductSearchResult & PublicCatalogProduct;

export function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Reject promptly even for non-abortable bindings. Never retry paid calls. */
async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('provider_timeout')); }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function openAIEmbedding(query: string, env: SiteEnv, signal: AbortSignal): Promise<number[]> {
  if (!env.OPENAI_API_KEY) throw new Error('embedding_unconfigured');
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: query, encoding_format: 'float' }),
  });
  // Do not log provider bodies, exception messages, query text or credentials.
  if (!response.ok) throw new Error('embedding_unavailable');
  if (Number(response.headers.get('content-length')) > 100_000) throw new Error('embedding_response_oversize');
  const body = await response.json() as { data?: { embedding?: number[] }[] };
  const vector = body.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) {
    throw new Error('embedding_invalid');
  }
  return vector;
}

function result(product: PublicCatalogProduct, similarity: number, matchType: 'semantic' | 'keyword'): SearchResult {
  // The catalog validator produces the public allowlist; never spread D1 rows.
  return {
    ...product,
    similarity,
    rankScore: similarity * 0.76 + (product.qualityScore || 0) * 0.22
      + (product.price > 0 && product.price <= 75 ? 0.02 : 0),
    matchType,
  };
}

function keywordSimilarity(product: PublicCatalogProduct, query: string): number {
  const needle = query.toLowerCase();
  if (product.punnyTitle?.toLowerCase().includes(needle)) return 0.78;
  if (product.title.toLowerCase().includes(needle)) return 0.74;
  if (product.wittyDescription?.toLowerCase().includes(needle)) return 0.68;
  if (product.humorTags?.join(' ').toLowerCase().includes(needle)) return 0.62;
  return 0.48;
}

function select(candidates: SearchResult[], limit: number, now: number,semanticDeadlines?:ReadonlyMap<string,number>): SearchResult[] {
  const ids = new Set<string>();
  return suppressNearDuplicateProducts(candidates.flatMap(candidate=>{
    const product=persistentPublicProduct(candidate)??resolvePublicProduct(candidate,now);
    if(!product)return[];
    // A permanent listing is not a renewed semantic/native freshness proof.
    if(candidate.matchType==='semantic'&&(semanticDeadlines?.get(candidate.publicId)??catalogDeadline(candidate.eligibleUntil))<=now)return[];
    return[result(product,candidate.similarity,candidate.matchType)];
  }).filter((product) => {
    if (ids.has(product.id) || !(product.eligibleUntil===null
      ? product.isActive&&product.qualityScore>=.55&&product.imageUrl&&product.affiliateUrl
      : isCatalogDisplayEligibleProduct(product))) return false;
    ids.add(product.id);
    return true;
  }), limit);
}

/** Per-isolate cache/limiter are best effort, not global spending guarantees. */
export function createSearchHandler<Env extends SiteEnv>(options: {
  catalogRevision: string;
  adapters: SearchAdapters<Env>;
  now?: () => number;
  providerTimeoutMs?: number;
  rateLimit?: number;
  semanticBudgetScope?: SemanticBudgetScope;
}) {
  const now = options.now || Date.now;
  const timeout = Math.max(10, Math.min(options.providerTimeoutMs ?? 1500, 3000));
  const cache = new Map<string, { until: number; results: SearchResult[];semanticDeadlines:ReadonlyMap<string,number> }>();
  const clients = new Map<string, { until: number; count: number }>();
  const maxRequests = Math.max(1, Math.min(options.rateLimit ?? 20, 60));
  const budgetScope = options.semanticBudgetScope && Object.freeze({ ...options.semanticBudgetScope });

  return async (request: Request, env: Env): Promise<Response> => {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
    if (new TextEncoder().encode(request.url).byteLength > 2048 || request.body) return json({ error: 'Request too large' }, 413);
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (query.length > 200) return json({ error: 'Query too long' }, 400);
    if (query.length < 2) return json({ results: [], searchId: null });
    const parsed = Number.parseInt(url.searchParams.get('limit') || '36', 10);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(60, parsed)) : 36;
    const startedAt = now();
    // IP is hashed in memory only and never written into diagnostic records.
    const clientKey = await sha256(request.headers.get('CF-Connecting-IP') || 'unknown');
    for (const [key, value] of clients) if (value.until <= startedAt) clients.delete(key);
    let client = clients.get(clientKey);
    if (!client) {
      // Reject new clients at capacity rather than evicting active limits.
      if (clients.size >= MAX_STATE_ENTRIES) return json({ error: 'Search busy' }, 429, { 'Retry-After': '60' });
      client = { until: startedAt + 60_000, count: 0 };
      clients.set(clientKey, client);
    }
    if (++client.count > maxRequests) return json({ error: 'Too many searches' }, 429, { 'Retry-After': String(Math.ceil((client.until - startedAt) / 1000)) });
    const queryHash = await sha256(query.toLowerCase());
    // The kill switch changes the key so cached semantic responses are not reused.
    const caps = semanticBudgetConfig(env, budgetScope);
    const semantic = Boolean(caps && env.VECTORIZE && options.adapters.reserveSemantic && (options.adapters.embed || env.OPENAI_API_KEY));
    const key = `${options.catalogRevision}:${EMBEDDING_MODEL}:${semantic}:${semantic ? `${caps!.requests}:${caps!.tokens}` : ''}:${limit}:${queryHash}`;
    const cached = cache.get(key);
    // Hashing above can cross a product deadline. Check the current clock and
    // reselect immediately before serialization, just as for uncached responses.
    if (cached && cached.until > now()) {
      const fresh = select(cached.results, limit, now(),cached.semanticDeadlines);
      if (fresh.length === cached.results.length) return json({ searchId: null, results: fresh });
    }
    cache.delete(key);

    try {
      const storage = options.adapters.storage(env);
      const candidateLimit = Math.min(240, limit * 4);
      let candidates: SearchResult[] = [];
      let vectorCount = 0;
      if (semantic) {
        try {
          const reserved = await bounded(() => options.adapters.reserveSemantic!(budgetScope!, semanticTokenUpperBound(query), env), timeout);
          if (reserved !== true) throw new Error('semantic_unallocated');
          const matches = await bounded(async (signal) => {
            const vector = await (options.adapters.embed || openAIEmbedding)(query, env, signal);
            if (vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) throw new Error('embedding_invalid');
            return env.VECTORIZE!.query(vector, {
              // Vectorize's actual topK ceiling is 100, not the 240 application cap.
              topK: Math.min(100, candidateLimit), returnValues: false, returnMetadata: 'none',
              filter: { catalogRevision: options.catalogRevision, eligible: true },
            });
          }, timeout);
          const scores = new Map<string, number>();
          for (const match of matches.matches.slice(0, Math.min(100, candidateLimit))) {
            if (typeof match.id === 'string' && match.id.length <= 100 && Number.isFinite(match.score)) scores.set(match.id, Math.max(-1, Math.min(1, match.score)));
          }
          vectorCount = scores.size;
          if (vectorCount) {
            const products = await bounded(() => storage.byPublicIds([...scores.keys()], new Date(now()), options.catalogRevision), timeout);
            candidates = products.filter((product) => scores.has(product.publicId))
              .map((product) => result(product, scores.get(product.publicId)!, 'semantic'))
              .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
          }
        } catch {
          // A provider failure only changes search mode. No raw error/query logs.
        }
      }
      const semanticDeadlines=new Map(candidates.map(product=>[product.publicId,catalogDeadline(product.eligibleUntil)]));
      let results = select(candidates, limit, now(),semanticDeadlines);
      if (results.length < limit && vectorCount < candidateLimit) {
        const products = await bounded(() => storage.keyword(query, candidateLimit - vectorCount, new Date(now()), options.catalogRevision), timeout);
        const semanticIds = new Set(results.map((product) => product.id));
        const keywords = products.slice(0, candidateLimit - vectorCount)
          .filter((product) => !semanticIds.has(product.id))
          .map((product) => result(product, keywordSimilarity(product, query), 'keyword'))
          .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
        results = select([...results, ...keywords], limit, now(),semanticDeadlines);
      }
      // Recheck deadlines after all I/O, and cap cache at the earliest result expiry.
      results = select(results, limit, now(),semanticDeadlines);
      const until = Math.min(startedAt + CACHE_MS,
        ...candidates.filter(product=>product.matchType==='semantic').map(product=>catalogDeadline(product.eligibleUntil)),
        ...results.map(product=>catalogDeadline(product.eligibleUntil)));
      if (until > now()) {
        if (cache.size >= MAX_STATE_ENTRIES) cache.delete(cache.keys().next().value!);
        cache.set(key, { results, until,semanticDeadlines });
      }
      let searchId: string | null = null;
      if (options.adapters.diagnostic) {
        const id = crypto.randomUUID();
        try {
          await bounded(() => options.adapters.diagnostic!({
            id, queryHash, queryLength: query.length, resultCount: results.length,
            topSimilarity: results[0]?.similarity ?? null, matchType: results[0]?.matchType || 'none',
            outcome: results.length ? 'ok' : 'empty',
          }, env, new Date(now())), Math.min(100, timeout));
          searchId = id;
        } catch { /* Diagnostic failure cannot fail usable results. */ }
      }
      const fresh = select(results, limit, now(),semanticDeadlines);
      if (fresh.length !== results.length) cache.delete(key);
      results = fresh;
      return json({ searchId, results });
    } catch {
      return json({ error: 'Search unavailable' }, 503, { 'Retry-After': '30' });
    }
  };
}
