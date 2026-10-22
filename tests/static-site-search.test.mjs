import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function search(href, query = "desk") {
  const effects = [];
  const events = new Map();
  const pushed = [];
  const requests = [];
  let scrolls = 0;
  const source = fs.readFileSync(new URL("../static-site/components/Search.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } });
  const commonJs = { exports: {} };
  vm.runInNewContext(outputText, {
    module: commonJs, exports: commonJs.exports, URL, URLSearchParams, AbortController, Event,
    require(name) {
      if (name === "react") return {
        useState: (initial) => [typeof initial === "string" ? query : initial, () => {}],
        useRef: (initial) => ({ current: initial }), useEffect: (effect) => effects.push(effect),
      };
      if (name === "./ProductCard") return { ProductCard: () => null };
      if (name === "../lib/analytics") return { captureRenderedLists() {}, captureStaticSearch() {} };
      return name.startsWith(".") ? createRequire(new URL("../static-site/components/Search.tsx", import.meta.url))(name) : require(name);
    },
    fetch: async (url, options) => { requests.push({ url, signal: options.signal });
      return { ok: true, json: async () => ({ results: [] }) }; },
    document: { getElementById: () => ({ scrollIntoView() { scrolls++; } }) },
    window: {
      location: { href, search: new URL(href).search },
      history: { pushState: (_state, _title, path) => pushed.push(path) },
      dispatchEvent: () => {},
      addEventListener: (name, listener) => events.set(name, listener),
      removeEventListener: (name) => events.delete(name),
    },
  });
  const view = commonJs.exports.Search();
  return { view, effects, events, pushed, requests, scrolls: () => scrolls };
}

test("bookmarked queries and history reveal search; short queries do not move the product-first homepage", async () => {
  for (const query of ["desk", "d", ""]) {
    const ui = search(`https://example.invalid/?q=${query}`);
    const cleanup = ui.effects[0]();
    await new Promise(setImmediate);
    assert.equal(ui.scrolls(), query.length >= 2 ? 1 : 0);
    assert.equal(ui.requests.length, query.length >= 2 ? 1 : 0);
    ui.events.get("popstate")();
    await new Promise(setImmediate);
    assert.equal(ui.scrolls(), query.length >= 2 ? 2 : 0);
    if (query.length >= 2) assert.equal(ui.requests[0].signal.aborted, true);
    cleanup();
    assert.equal(ui.events.size, 0);
  }
});

test("safe product/guide search submissions use root bookmarks, with the same native GET fallback", () => {
  for (const path of ["/", "/gifts/expired", "/gift-guides/held", "/safe/catalog"]) {
    const ui = search(`https://example.invalid${path}?utm_source=owned`, " desk ");
    const form = ui.view.props.children[0];
    assert.equal(form.type, "form");
    assert.equal(form.props.action, "/");
    assert.equal(form.props.method, "get");
    let prevented = false;
    form.props.onSubmit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.deepEqual(ui.pushed, ["/?utm_source=owned&q=desk"]);
  }
});
