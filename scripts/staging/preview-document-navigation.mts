/** LOCAL proof only: actual Worker routing/APIs over disk assets, no provider bindings.
 * node --import tsx scripts/staging/preview-document-navigation.mts <built-repo> [port]
 * DENY_FLIGHT=1 denies external navigation companions even in a full package.
 * stdout is a JSONL network receipt; inspect deniedFlight/rsc request counts.
 * This does not emulate Cloudflare's asset cache, deployment, or isolate limits.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createSiteWorker } from '../../workers/site/index.ts';
import { d1SearchAdapters } from '../../workers/site/d1-search.ts';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';

const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 2962);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
const generated = path.join(root, 'build/stupid-gifts');
const read = async (name: string) => JSON.parse(await fs.readFile(path.join(generated, name), 'utf8'));
const [manifest, snapshot, feedPlan, releaseIdentity] = await Promise.all([
  read('asset-manifest.json'), read('catalog.snapshot.json'), read('feed-plan.json'), read('release-identity.json'),
]);
const output = path.join(root, 'static-site/out');
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const worker = createSiteWorker({ manifest, snapshot, feedPlan, releaseIdentity, searchAdapters: d1SearchAdapters });
const env = {
  // Staging mode suppresses production analytics transports. This is a local
  // synthetic gate, not a credential; the adapter supplies it only to itself.
  ENVIRONMENT: 'staging', STAGING_AUTH_SECRET: 'local-document-proof-only', SEMANTIC_SEARCH_ENABLED: 'false',
  // Fail closed if a supposedly permanent local browse/search needs a provider.
  DB: { prepare() { console.error('LOCAL_PROOF_FORBIDS_DATABASE'); throw new Error('LOCAL_PROOF_FORBIDS_DATABASE'); } } as unknown as CatalogD1,
  VECTORIZE: { async query(): Promise<{ matches: never[] }> { console.error('LOCAL_PROOF_FORBIDS_VECTORIZE'); throw new Error('LOCAL_PROOF_FORBIDS_VECTORIZE'); } },
  ASSETS: { async fetch(request: Request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = path.resolve(output, `.${pathname}`);
    if (!file.startsWith(`${output}/`)) return new Response(null, { status: 400 });
    try { return new Response(await fs.readFile(file), { headers: { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' } }); }
    catch { return new Response(null, { status: 404 }); }
  } },
};
http.createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url || '/', `http://127.0.0.1:${port}`);
  const deniedFlight = process.env.DENY_FLIGHT === '1' && url.pathname.endsWith('.txt')
    && url.pathname !== '/robots.txt' && !url.pathname.startsWith('/fonts/') && !url.pathname.startsWith('/safe/')
    && !/^\/privacy(?:[/.]|$)/.test(url.pathname);
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    headers.set('Authorization', `Basic ${btoa(`staging:${env.STAGING_AUTH_SECRET}`)}`);
    const request = new Request(url, { method: incoming.method, headers,
      ...(!['GET', 'HEAD'].includes(incoming.method || 'GET') ? { body: Buffer.concat(chunks) } : {}) });
    const response = deniedFlight ? new Response('External Flight denied by local proof', { status: 410 }) : await worker.fetch(request, env);
    outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
    console.log(JSON.stringify({ method: incoming.method, path: url.pathname, query: url.search, status: response.status,
      deniedFlight, rsc: headers.get('rsc'), prefetch: headers.get('next-router-prefetch'), destination: headers.get('sec-fetch-dest') }));
  } catch (error) {
    console.error(error); outgoing.writeHead(500); outgoing.end('Local proof error');
  }
}).listen(port, '127.0.0.1', () => console.log(JSON.stringify({ localProof: true, root, port, denyFlight: process.env.DENY_FLIGHT === '1', release: manifest.releaseId })));
