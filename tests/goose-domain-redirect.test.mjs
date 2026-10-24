import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { OLD_HOSTS, redirectTarget } from '../scripts/ops/goose-domain-redirect.mjs';

test('reviewed Cloudflare rule is a narrowly scoped permanent path/query redirect', () => {
  const plan = JSON.parse(fs.readFileSync(new URL('../docs/ops/goose-redirect-2026-10-23/redirect-rule.json', import.meta.url)));
  assert.equal(plan.phase, 'http_request_dynamic_redirect'); assert.equal(plan.kind, 'zone'); assert.equal(plan.rules.length, 1);
  assert.equal(plan.rules[0].expression, 'http.host in {"goose.gifts" "www.goose.gifts"}');
  assert.deepEqual(plan.rules[0].action_parameters.from_value, { status_code: 301,
    target_url: { expression: 'concat("https://stupid.gifts", http.request.uri.path)' }, preserve_query_string: true });
});
test('both hosts and schemes preserve paths, duplicate query parameters and attribution without an open redirect', () => {
  for (const host of OLD_HOSTS) for (const scheme of ['http:', 'https:']) {
    for (const suffix of ['/', '/gifts/a-real-product?utm_source=pinterest&utm_content=arm_p&x=1&x=2',
      '/gift-guides/funny-gifts-for-dads', '/random-gift', '/missing', '/bundles/retired', '/a%20b?next=https%3A%2F%2Fexample.com',
      '//example.com/path?utm_source=qa']) {
      assert.equal(redirectTarget(`${scheme}//${host}${suffix}`), `https://stupid.gifts${suffix}`);
    }
  }
});
test('unrelated domains, credentials, ports and protocols cannot acquire this redirect', () => {
  for (const url of ['https://stupid.gifts/a', 'https://goose.gifts.example.com/a', 'https://api.goose.gifts/a',
    'https://user@goose.gifts/a', 'https://goose.gifts:8443/a', 'ftp://goose.gifts/a']) assert.equal(redirectTarget(url), null);
});
