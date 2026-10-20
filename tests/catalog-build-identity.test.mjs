import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { releaseBuildEnvironment, siteIdentityBytes, validateBuildContext } from '../scripts/staging/build.mts';
import { verifyReleaseContext, verifySiteIdentity, verifySiteOutputOrigins } from '../scripts/staging/verify-release.mts';
import { siteIdentityFor } from '../static-site/lib/site-identity.ts';

const snapshot = { catalogRevision: 'controlled-r1', generatedAt: '2026-10-20T00:00:00.000Z' };
const context = { schemaVersion: 1, sourceMode: 'preview', releaseId: 'controlled-release', codeSha: 'a'.repeat(40),
  catalogRevision: snapshot.catalogRevision, catalogSnapshotSha256: 'b'.repeat(64), generatedAt: snapshot.generatedAt,
  vectorSyncWatermark: 0, priorReleaseId: null };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validate = input => validateBuildContext(input, snapshot, context.codeSha, context.catalogSnapshotSha256, new Date('2026-10-20T12:00:00.000Z'));

test('reviewed source mode is mandatory, allowlisted, sealed in context, and not inferred from NODE_ENV', () => {
  const missing = { ...context }; delete missing.sourceMode;
  assert.throws(() => validate(missing), /context/);
  for (const sourceMode of ['', 'production', 'https://example.invalid']) assert.throws(() => validate({ ...context, sourceMode }), /source mode/);
  for (const sourceMode of ['preview', 'goose-production', 'stupid-production']) {
    const reviewed = validate({ ...context, sourceMode });
    assert.equal(reviewed.sourceMode, sourceMode);
    const selected = releaseBuildEnvironment(reviewed, { NODE_ENV: 'production' });
    assert.equal(selected.CATALOG_SITE_MODE, sourceMode); assert.equal(selected.NEXT_PUBLIC_STATIC_SITE_MODE, sourceMode);
    verifyReleaseContext(reviewed, reviewed, snapshot, reviewed.codeSha);
    assert.throws(() => verifyReleaseContext(reviewed, { ...reviewed, sourceMode: sourceMode === 'preview' ? 'goose-production' : 'preview' }, snapshot, reviewed.codeSha), /context changed/);
  }
});

test('conflicting private/public caller modes are refused before starting a build', () => {
  for (const key of ['CATALOG_SITE_MODE', 'NEXT_PUBLIC_STATIC_SITE_MODE']) {
    assert.throws(() => releaseBuildEnvironment(context, { [key]: 'goose-production' }), /conflicts/);
    assert.throws(() => releaseBuildEnvironment(context, { [key]: '' }), /conflicts/);
  }
  assert.equal(releaseBuildEnvironment(context, { CATALOG_SITE_MODE: 'preview', NEXT_PUBLIC_STATIC_SITE_MODE: 'preview' }).CATALOG_SITE_MODE, 'preview');
});

test('identity bytes and checksum are deterministic, derived only from reviewed source mode, and never self-sealed from changed data', () => {
  for (const sourceMode of ['preview', 'goose-production', 'stupid-production']) {
    const bytes = Buffer.from(siteIdentityBytes(sourceMode));
    const manifest = { sourceMode, siteIdentitySha256: digest(bytes) };
    verifySiteIdentity(bytes, manifest);
    assert.deepEqual(JSON.parse(bytes), { schemaVersion: 1, sourceMode, ...siteIdentityFor(sourceMode) });
    assert.throws(() => verifySiteIdentity(Buffer.from(bytes.toString().trim()), manifest), /Site identity/);
    const altered = Buffer.from(bytes.toString().replace(siteIdentityFor(sourceMode).origin, 'https://unexpected.invalid'));
    assert.throws(() => verifySiteIdentity(altered, { ...manifest, siteIdentitySha256: digest(altered) }), /Site identity/);
    assert.throws(() => verifySiteIdentity(bytes, { ...manifest, sourceMode: sourceMode === 'preview' ? 'goose-production' : 'preview' }), /Site identity/);
  }
});

const html = (origin, robots = 'noindex,nofollow') => `<html><head><meta name="robots" content="${robots}">
  <link href="${origin}/gifts/test" rel="canonical"><meta content="${origin}/gifts/test" property="og:url">
  <meta property="og:image" content="${origin}/og/controlled.png"><meta name="twitter:image" content="${origin}/og/controlled.png"></head>
  <body><a href="https://www.amazon.com/dp/CONTROLLED?tag=not-a-canonical">Retailer</a></body></html>`;
test('canonical/OG origins follow reviewed mode, not an output-supplied host or merchant URLs', () => {
  for (const sourceMode of ['preview', 'goose-production', 'stupid-production']) {
    const origin = siteIdentityFor(sourceMode).origin;
    assert.deepEqual(verifySiteOutputOrigins(html(origin), sourceMode), { canonical: 1, openGraph: 1 });
    assert.throws(() => verifySiteOutputOrigins(html('https://unexpected.invalid'), sourceMode), /origin disagrees/);
    assert.throws(() => verifySiteOutputOrigins(html(origin).replace(`${origin}/og/controlled.png`, 'https://stupid.gifts.evil.invalid/card.png'), sourceMode), /origin disagrees/);
    assert.throws(() => verifySiteOutputOrigins(html(origin).replace(`${origin}/gifts/test`, '/gifts/test'), sourceMode), /Invalid canonical/);
  }
});
test('preview and production-mode fixtures cannot lose noindex while eligible production pages may opt in', () => {
  const preview = siteIdentityFor('preview').origin;
  assert.throws(() => verifySiteOutputOrigins(html(preview, 'index,follow'), 'preview'), /noindex/);
  assert.throws(() => verifySiteOutputOrigins(html(preview).replace(/<meta name="robots"[^>]*>/, ''), 'preview'), /noindex/);
  const goose = siteIdentityFor('goose-production').origin;
  verifySiteOutputOrigins(html(goose, 'index,follow'), 'goose-production');
  assert.throws(() => verifySiteOutputOrigins(html(goose, 'index,follow'), 'goose-production', true), /noindex/);
});
