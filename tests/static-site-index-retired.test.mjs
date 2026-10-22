import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

test('Index pages, source readers and public data are removed rather than redirected', async () => {
  for (const name of ['app/weird-gift-index/page.tsx', 'app/weird-gift-index/data/route.ts',
    'app/weird-gift-index/opengraph-image.tsx', 'static-site/app/weird-gift-index/page.tsx',
    'static-site/app/weird-gift-index/data.json/route.ts', 'static-site/lib/weird-index.ts',
    'lib/weird-gift-index.ts', 'lib/weird-gift-index-analysis.ts', 'static-site/public/safe/index.json'])
    await assert.rejects(fs.access(new URL(`../${name}`, import.meta.url)), { code: 'ENOENT' }, name);
  const sitemap = await fs.readFile(new URL('../app/sitemap.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sitemap, /weird-gift-index/);
});

test('local preview refuses retired paths even when stale files are present', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stupid-retired-index-'));
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  let child;
  try {
    await fs.mkdir(path.join(root, 'weird-gift-index'), { recursive: true });
    await fs.mkdir(path.join(root, 'safe'));
    for (const file of ['weird-gift-index.html', 'weird-gift-index/data.json', 'safe/index.json'])
      await fs.writeFile(path.join(root, file), 'Retired content must not be served');
    await fs.writeFile(path.join(root, 'index.html'), 'Current public homepage');
    child = spawn(process.execPath, [new URL('../static-site/scripts/preview-server.mjs', import.meta.url).pathname], {
      env: { ...process.env, PORT: String(port), STATIC_PREVIEW_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Preview did not start')), 10_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Preview exited before listening')); });
      child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    });
    for (const retired of ['/weird-gift-index', '/weird-gift-index/', '/weird-gift-index.html',
      '/weird-gift-index/data', '/weird-gift-index/data.json', '/%77eird-gift-index', '/safe/index.json']) {
      const response = await fetch(`http://127.0.0.1:${port}${retired}`, { redirect: 'manual' });
      assert.equal(response.status, 404, retired);
      assert.equal(response.headers.get('Location'), null);
      assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
      assert.doesNotMatch(await response.text(), /Retired content/);
    }
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'Current public homepage');
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await fs.rm(root, { recursive: true, force: true });
  }
});
