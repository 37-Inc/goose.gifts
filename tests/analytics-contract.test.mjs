import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  buildOutboundClickEvent,
  buildPageViewEvent,
  buildSearchEvent,
  buildSelectItemEvent,
  buildViewItemListEvent,
  sanitizePathname,
} from '../lib/analytics-contract.ts';

const unsafeAttribution = {
  sessionId: 'private-session-id',
  landingPage: '/?q=recipient+name&utm_term=private&utm_content=secret',
  utmSource: 'Pinterest<script>',
  utmMedium: 'social paid',
  utmCampaign: 'goose launch?private=yes',
  utmContent: 'private-creative',
  utmTerm: 'recipient name',
  referrerHost: 'www.pinterest.com',
};

test('pathname sanitizer removes query strings and external origins', () => {
  assert.equal(sanitizePathname('/gift-guides/funny?q=secret'), '/gift-guides/funny');
  assert.equal(sanitizePathname('https://evil.example/private?q=secret'), '/private');
});

test('page and search events keep only coarse attribution and counts', () => {
  const pageView = buildPageViewEvent({
    pathname: '/?q=recipient+name',
    attribution: unsafeAttribution,
  });
  const search = buildSearchEvent({
    pathname: '/?q=recipient+name',
    resultCount: 12,
    attribution: unsafeAttribution,
  });

  assert.deepEqual(pageView, {
    name: 'page_view',
    properties: {
      pathname: '/',
      traffic_source: 'Pinterest_script',
      traffic_medium: 'social_paid',
      traffic_campaign: 'goose_launch_private_yes',
    },
  });
  assert.equal(search.name, 'search');
  assert.equal(search.properties.result_count, 12);
  assert.equal(search.properties.ui_context, 'catalog_search');
  assert.equal(JSON.stringify(search).includes('recipient'), false);
  assert.equal(JSON.stringify(search).includes('utm_term'), false);
  assert.equal(JSON.stringify(search).includes('private-session-id'), false);
});

test('product list and selection contracts exclude names, prices, and free-form categories', () => {
  const list = buildViewItemListEvent({
    pathname: '/',
    clickSource: 'catalog',
    contextSlug: 'featured',
    products: [
      { id: 'amazon:123', source: 'amazon' },
      { id: 'etsy:456', source: 'etsy' },
    ],
  });
  const selection = buildSelectItemEvent({
    pathname: '/gifts/example?q=secret',
    clickSource: 'gift_page',
    productId: 'amazon:123',
    productSource: 'amazon',
    index: 0,
  });

  assert.equal(list.name, 'view_item_list');
  assert.deepEqual(list.properties.items, [
    { item_id: 'amazon:123', item_brand: 'amazon', index: 0 },
    { item_id: 'etsy:456', item_brand: 'etsy', index: 1 },
  ]);
  assert.equal(selection.properties.pathname, '/gifts/example');
  assert.equal('item_name' in selection.properties, false);
  assert.equal('price' in selection.properties, false);
});

test('outbound contract reduces affiliate URLs to domains and drops raw attribution', () => {
  const event = buildOutboundClickEvent({
    pathname: '/random-gift?spin=private-seed',
    clickSource: 'random_gift',
    contextSlug: 'featured',
    productId: 'amazon:123',
    productSource: 'amazon',
    affiliateUrl: 'https://www.amazon.com/dp/123?tag=secret-affiliate-tag',
    attribution: unsafeAttribution,
  });
  const serialized = JSON.stringify(event);

  assert.equal(event.properties.pathname, '/random-gift');
  assert.equal(event.properties.link_domain, 'www.amazon.com');
  assert.equal(event.properties.product_id, 'amazon:123');
  assert.equal(serialized.includes('secret-affiliate-tag'), false);
  assert.equal(serialized.includes('private-creative'), false);
  assert.equal(serialized.includes('recipient name'), false);
});

test('the single client adapter preserves destinations and disables broad capture', async () => {
  const adapter = await readFile(new URL('../lib/client-analytics.ts', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const clientComponents = await Promise.all([
    '../components/CatalogSearchFeed.tsx',
    '../components/ProductGrid.tsx',
    '../components/ProductClickButton.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

  assert.match(adapter, /G-6RR3HPR747/);
  assert.match(adapter, /AW-17626116539/);
  assert.match(adapter, /push\(arguments\)/);
  assert.match(adapter, /page_referrer: ''/);
  assert.match(adapter, /autocapture: false/);
  assert.match(adapter, /capture_pageview: false/);
  assert.match(adapter, /capture_pageleave: false/);
  assert.match(adapter, /capture_exceptions: false/);
  assert.match(adapter, /disable_session_recording: true/);
  assert.match(adapter, /disable_surveys: true/);
  assert.match(adapter, /respect_dnt: true/);
  assert.match(adapter, /POSTHOG_ALLOWED_PROPERTIES/);
  assert.match(adapter, /EXPLICIT_EVENT_NAMES/);
  assert.match(adapter, /before_send:/);
  assert.match(adapter, /\$set: undefined/);
  assert.match(adapter, /\$set_once: undefined/);
  assert.match(adapter, /\$geoip_disable: true/);
  assert.match(layout, /<AnalyticsProvider \/>/);
  assert.doesNotMatch(layout, /googletagmanager/);

  const componentSource = clientComponents.join('\n');
  assert.doesNotMatch(componentSource, /gtag\(['"]event/);
  assert.doesNotMatch(componentSource, /search_term/);
  assert.doesNotMatch(componentSource, /event_label/);
  assert.doesNotMatch(componentSource, /landing_page/);
});
