import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as contract from "../lib/analytics-contract.ts";

const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise((resolve) => setImmediate(resolve));
function load(relative, globals, require) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const commonJs = { exports: {} };
  vm.runInNewContext(outputText, { module: commonJs, exports: commonJs.exports, require,
    URL, URLSearchParams, console, ...globals });
  return commonJs.exports;
}
function environment(hostname = "stupid.gifts", enabled = "true") {
  const calls = [], scripts = [], captures = [], listeners = new Set();
  const posthog = {
    init: (_key, options) => { posthog.options = options; },
    capture: (...args) => captures.push(args),
  };
  const window = {
    location: { hostname, protocol: "https:", pathname: "/gifts/safe-product",
      search: "?q=private+search&utm_source=Pinterest&utm_medium=social&utm_campaign=fall&utm_term=private-term" },
    gtag: (...args) => calls.push(args),
    get localStorage() { throw new Error("Must not read storage"); },
    get sessionStorage() { throw new Error("Must not read storage"); },
  };
  const navigator = {};
  class Element {}
  const card = new Element();
  card.dataset = { analyticsId: "amazon:123", analyticsSource: "amazon",
    analyticsContext: "home_opening", analyticsExpiry: "2099-01-01T00:00:00.000Z" };
  const document = {
    referrer: "https://example.com/private?email=private",
    head: { appendChild: (script) => scripts.push(script) },
    querySelector: () => undefined,
    createElement: () => ({ dataset: {} }),
    querySelectorAll: () => [card],
    addEventListener: (_name, callback) => listeners.add(callback),
    removeEventListener: (_name, callback) => listeners.delete(callback),
  };
  let attributionReads = 0, adapterLoads = 0;
  const globals = { window, document, navigator, Element,
    process: { env: { NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED: enabled,
      NEXT_PUBLIC_POSTHOG_KEY: "existing-test-key", NEXT_PUBLIC_POSTHOG_HOST: "https://analytics.example" } } };
  const shared = load("../lib/client-analytics.ts", globals, (name) => {
    if (name === "./analytics-contract") return contract;
    if (name === "./client-attribution") return { getClickAttribution: () => {
      attributionReads++;
      return { sessionId: "private-session", landingPage: "/?q=private-search", utmSource: "Pinterest" };
    } };
    if (name === "posthog-js") return { default: posthog };
    throw new Error(`Unexpected dependency ${name}`);
  });
  const analytics = load("../static-site/lib/analytics.ts", globals, (name) => {
    assert.equal(name, "../../lib/client-analytics");
    adapterLoads++;
    return shared;
  });
  return { ...globals, card, calls, captures, scripts, listeners, posthog, shared, analytics,
    attributionReads: () => attributionReads, adapterLoads: () => adapterLoads,
    click(outbound = false) {
      const link = new Element();
      link.href = outbound ? "https://www.amazon.com/dp/PRIVATE?tag=private-affiliate" : "/gifts/safe-product";
      link.closest = () => card;
      link.hasAttribute = () => outbound;
      const target = new Element();
      target.closest = () => link;
      const event = { target, button: 0, defaultPrevented: false };
      for (const callback of listeners) callback(event);
      assert.equal(event.defaultPrevented, false, "native navigation must remain untouched");
    },
  };
}

test("Goose legacy host policy, destinations, attribution and Ads callbacks remain unchanged", async () => {
  const env = environment("goose.gifts");
  assert.equal(env.shared.isClientAnalyticsAllowed(), true);
  env.shared.capturePageView("/?q=private-search");
  let callbackCount = 0;
  assert.equal(env.shared.captureOutboundProductClick({ clickSource: "gift_page_primary_cta",
    productId: "amazon:123", productSource: "amazon", affiliateUrl: "https://amazon.com/dp/private?tag=secret",
    attribution: { utmSource: "Pinterest" }, callback: () => callbackCount++ }), true);
  await flush();
  assert.deepEqual(plain(env.calls.filter(([name]) => name === "config")), [
    ["config", "G-6RR3HPR747", { send_page_view: false }],
    ["config", "AW-17626116539", { send_page_view: false }],
  ]);
  const page = env.calls.find((call) => call[1] === "page_view");
  assert.equal(page[2].page_location, "https://www.goose.gifts/");
  assert.equal(env.attributionReads(), 1);
  const outbound = env.calls.find((call) => call[1] === "conversion_event_outbound_click");
  assert.equal(outbound[2].event_timeout, 2000);
  outbound[2].event_callback();
  assert.equal(callbackCount, 1);
  assert.equal(outbound[2].link_domain, "amazon.com");
  assert.doesNotMatch(JSON.stringify(env.calls), /private-search|private-session|tag=secret/);
  for (const hostname of ["www.goose.gifts", "stupid.gifts", "localhost"]) {
    env.window.location.hostname = hostname;
    assert.equal(env.shared.isClientAnalyticsAllowed(), hostname === "www.goose.gifts");
  }
});

test("static staging, fixtures, unknown hosts, local and browser privacy signals load no adapter/providers", async () => {
  const cases = [
    { enabled: undefined }, { enabled: "false" }, { catalog: false },
    { host: "localhost" }, { host: "staging.stupid.gifts" }, { host: "www.stupid.gifts" },
    { host: "goose.gifts" }, { host: "stupid.gifts.evil.example" }, { protocol: "http:" },
    { navigator: { doNotTrack: "1" } }, { navigator: { globalPrivacyControl: true } },
    { windowDnt: "1" },
  ];
  for (const entry of cases) {
    const env = environment(entry.host, Object.hasOwn(entry, "enabled") ? entry.enabled : "true");
    // environment's default parameter is intentionally overridden for unset builds.
    if (Object.hasOwn(entry, "enabled")) env.process.env.NEXT_PUBLIC_STATIC_ANALYTICS_ENABLED = entry.enabled;
    Object.assign(env.navigator, entry.navigator);
    if (entry.protocol) env.window.location.protocol = entry.protocol;
    env.window.doNotTrack = entry.windowDnt;
    env.analytics.startStaticAnalytics(entry.catalog !== false);
    env.analytics.captureStaticSearch(3);
    env.analytics.captureStaticRandomSpin();
    await flush();
    assert.equal(env.adapterLoads(), 0, JSON.stringify(entry));
    assert.equal(env.calls.length + env.scripts.length + env.captures.length, 0);
    assert.equal(env.listeners.size, 0);
    assert.equal(env.attributionReads(), 0);
  }
});

test("opt-in exact static host sends only contract payloads, once per mount/list and actual action", async () => {
  const env = environment();
  const cleanup = env.analytics.startStaticAnalytics(true);
  cleanup(); // React development effect remount must not double-count.
  const cleanupAgain = env.analytics.startStaticAnalytics(true);
  await flush();
  env.analytics.captureRenderedLists();
  env.analytics.captureStaticSearch(1);
  env.analytics.captureStaticRandomSpin();
  env.click();
  env.click(true);
  await flush();
  const events = env.calls.filter(([name]) => name === "event");
  assert.deepEqual(events.map((event) => event[1]), ["page_view", "view_item_list", "search",
    "random_gift_spin", "select_item", "conversion_event_outbound_click"]);
  const clean = (properties) => plain({ ...properties, event_callback: undefined });
  const shared = { pathname: "/gifts/safe-product", page_location: "https://stupid.gifts/gifts/safe-product", page_referrer: "" };
  const traffic = { traffic_source: "Pinterest", traffic_medium: "social", traffic_campaign: "fall" };
  assert.deepEqual(clean(events[0][2]), { ...shared, ...traffic });
  assert.deepEqual(clean(events[1][2]), { ...shared, ui_context: "home_opening", item_list_id: "home_opening",
    result_count: 1, items: [{ item_id: "amazon:123", item_brand: "amazon", index: 0 }] });
  assert.deepEqual(clean(events[2][2]), { ...shared, ...traffic, ui_context: "catalog_search", result_count: 1 });
  assert.deepEqual(clean(events[3][2]), { ...shared, ui_context: "random_gift" });
  assert.deepEqual(clean(events[4][2]), { ...shared, ui_context: "home_opening", item_list_id: "home_opening",
    product_id: "amazon:123", source: "amazon", items: [{ item_id: "amazon:123", item_brand: "amazon", index: 0 }] });
  assert.deepEqual(clean(events[5][2]), { ...shared, ...traffic, ui_context: "home_opening",
    product_id: "amazon:123", source: "amazon", link_domain: "www.amazon.com", event_timeout: 2000 });
  assert.equal(typeof events[5][2].event_callback, "function");
  assert.equal(env.attributionReads(), 0, "static adapter must not use Goose's persisted attribution");
  assert.doesNotMatch(JSON.stringify([env.calls, env.captures]), /private|PRIVATE|affiliate|\?q=|utm_term|landingPage|sessionId/);
  assert.equal(env.captures.length, 6);
  const filtered = env.posthog.options.before_send({ event: "search", properties: { result_count: 1, query: "private", $current_url: "private" } });
  assert.deepEqual(plain(filtered.properties), { result_count: 1, $geoip_disable: true });
  env.navigator.globalPrivacyControl = true;
  env.analytics.captureStaticSearch(99);
  assert.equal(env.posthog.options.before_send({ event: "search", properties: {} }), null);
  await flush();
  assert.equal(env.calls.filter(([name]) => name === "event").length, 6);
  cleanupAgain();
  assert.equal(env.listeners.size, 0);
});

test("privacy rechecked after deferred adapter/provider import; SSR remains off", async () => {
  const env = environment();
  env.analytics.startStaticAnalytics(true);
  env.navigator.doNotTrack = "1";
  await flush();
  assert.equal(env.calls.length + env.scripts.length + env.captures.length, 0);
  assert.equal(env.posthog.options, undefined);
  const server = load("../static-site/lib/analytics.ts", { process: { env: {} } }, () => { throw new Error("No server import"); });
  assert.equal(server.isStaticAnalyticsAllowed(), false);
  const deferred = environment("goose.gifts");
  deferred.shared.capturePageView("/"); // Google is synchronous; PostHog import is deferred.
  deferred.navigator.globalPrivacyControl = true;
  await flush();
  assert.equal(deferred.posthog.options, undefined);
  assert.equal(deferred.captures.length, 0);
});
