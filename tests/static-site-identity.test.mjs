import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function identity(env = {}) {
  const source = fs.readFileSync(new URL("../static-site/lib/site-identity.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const commonJs = { exports: {} };
  vm.runInNewContext(outputText, { module: commonJs, exports: commonJs.exports, process: { env } });
  return commonJs.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
test("default stays protected Stupid preview, even under NODE_ENV=production", () => {
  const config = identity({ NODE_ENV: "production" });
  assert.equal(config.siteSourceMode, "preview"); assert.equal(config.isSitePreview, true); assert.equal(config.isSiteProduction, false);
  assert.deepEqual(plain(config.siteIdentity), { brand: "stupid", name: "Stupid Gifts", origin: "https://staging.stupid.gifts",
    hostname: "staging.stupid.gifts", wordmark: "stupid.gifts", tagline: "Very bad ideas. Carefully considered." });
  for (const host of ["staging.stupid.gifts", "stupid.gifts", "www.goose.gifts"]) assert.equal(config.isSiteAnalyticsHostname(host), false);
  assert.equal(Object.isFrozen(config.siteIdentity), true);
});
test("explicit Goose runtime keeps the existing canonical host; rebrand is separate opt-in", () => {
  const goose = identity({ CATALOG_SITE_MODE: "goose-production" });
  assert.equal(goose.siteIdentity.brand, "goose"); assert.equal(goose.siteIdentity.origin, "https://www.goose.gifts");
  assert.equal(goose.siteIdentity.wordmark, "goose.gifts"); assert.equal(goose.isSiteProduction, true);
  const stupid = identity({ NEXT_PUBLIC_STATIC_SITE_MODE: "stupid-production" });
  assert.equal(stupid.siteIdentity.origin, "https://stupid.gifts"); assert.equal(stupid.siteIdentity.brand, "stupid");
  assert.equal(stupid.isSitePreview, false);
  for (const host of ["www.goose.gifts", "goose.gifts"]) assert.equal(goose.isSiteAnalyticsHostname(host), true);
  for (const host of ["stupid.gifts", "staging.stupid.gifts", "www.goose.gifts.evil.example", "localhost"]) assert.equal(goose.isSiteAnalyticsHostname(host), false);
  assert.equal(stupid.isSiteAnalyticsHostname("stupid.gifts"), true); assert.equal(stupid.isSiteAnalyticsHostname("www.stupid.gifts"), false);
  assert.equal(goose.isSiteInternalHostname("goose.gifts"), true); assert.equal(goose.isSiteInternalHostname("stupid.gifts"), false);
  assert.equal(stupid.isSiteInternalHostname("www.stupid.gifts"), true);
});
test("unknown/empty/arbitrary origins and disagreement are rejected rather than inferred", () => {
  for (const mode of ["", "production", "https://example.com", "goose", "GOOSE-PRODUCTION"]) assert.throws(() => identity({ CATALOG_SITE_MODE: mode }), /source mode/);
  assert.throws(() => identity({ CATALOG_SITE_MODE: "goose-production", NEXT_PUBLIC_STATIC_SITE_MODE: "stupid-production" }), /mismatch/);
  const config = identity();
  assert.throws(() => config.siteIdentityFor("https://example.com"), /source mode/);
  assert.equal(config.siteIdentity.origin, "https://staging.stupid.gifts");
});
test("serialized identity includes explicit reviewed source mode and has no environment-dependent extras", () => {
  for (const mode of ["preview", "goose-production", "stupid-production"]) {
    const config = identity({ CATALOG_SITE_MODE: mode, NEXT_PUBLIC_STATIC_SITE_MODE: mode });
    assert.deepEqual(plain(config.siteIdentityRecord), { schemaVersion: 1, sourceMode: mode, ...plain(config.siteIdentity) });
    assert.equal(Object.isFrozen(config.siteIdentityRecord), true);
    assert.equal(identity({ CATALOG_SITE_MODE: mode, NODE_ENV: "test" }).siteIdentityRecord.sourceMode, mode);
  }
});
