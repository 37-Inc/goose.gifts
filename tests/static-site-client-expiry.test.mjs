import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function boundary(deadlines, now = 1000, presentation = false) {
  let expired = false;
  let clock = now;
  let timerId = 0;
  const timers = new Map();
  const events = new Map();
  const effects = [];
  const source = fs.readFileSync(new URL("../static-site/components/StaticContentExpiry.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } });
  const commonJs = { exports: {} };
  const listen = (name, listener) => events.set(name, listener);
  const unlisten = (name) => events.delete(name);
  vm.runInNewContext(outputText, {
    module: commonJs, exports: commonJs.exports,
    require(name) {
      assert.equal(name, "react");
      return { useState: () => [expired, (value) => { expired = value; }],
        useEffect: (effect) => effects.push(effect) };
    },
    Date: class extends Date { static now() { return clock; } },
    document: {
      querySelector: () => presentation ? {} : null,
      querySelectorAll: () => deadlines.map((deadline) => ({ getAttribute: () => deadline })),
      addEventListener: listen, removeEventListener: unlisten,
    },
    window: {
      setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
      clearTimeout: (id) => timers.delete(id),
      addEventListener: listen, removeEventListener: unlisten,
    },
  });
  const render = () => commonJs.exports.StaticContentExpiry({ children: "merchant body", fallback: "safe body" });
  assert.equal(render(), "merchant body");
  const cleanup = effects.shift()();
  return { render, timers, events, cleanup, advance(value) { clock = value; },
    fireTimer() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.callback(); } };
}

test("open static product bodies clear at the earliest displayed deadline, including restored background tabs", () => {
  for (const trigger of ["timer", "pageshow", "visibilitychange"]) {
    const guard = boundary([new Date(5000).toISOString(), new Date(3000).toISOString()]);
    assert.equal([...guard.timers.values()][0].delay, 2000);
    guard.advance(2999);
    guard.events.get("pageshow")();
    assert.equal(guard.render(), "merchant body");
    assert.equal([...guard.timers.values()][0].delay, 1);
    guard.advance(3000);
    if (trigger === "timer") guard.fireTimer();
    else guard.events.get(trigger)();
    assert.equal(guard.render(), "safe body");
    assert.equal(guard.timers.size, 0);
    guard.cleanup();
    assert.equal(guard.events.size, 0);
  }
});

test("already-expired bodies clear immediately; product-free legal, held and safe pages do not loop or expire", () => {
  assert.equal(boundary([new Date(999).toISOString()]).render(), "safe body");
  for (const deadlines of [[], ["not-a-date"]]) {
    const guard = boundary(deadlines);
    assert.equal(guard.render(), "merchant body");
    assert.equal(guard.timers.size, 0);
    assert.equal(guard.events.size, 0);
  }
});

test("distant deadlines recheck without overflowing the browser timer", () => {
  const guard = boundary([new Date(4_000_000_000).toISOString()]);
  assert.equal([...guard.timers.values()][0].delay, 2_147_483_647);
  guard.advance(2_147_484_647);
  guard.fireTimer();
  assert.equal(guard.render(), "merchant body");
  assert.equal([...guard.timers.values()][0].delay, 4_000_000_000 - 2_147_484_647);
  guard.cleanup();
});

test("presentation retains its own expiry guard and immutable unavailable-episode record", () => {
  const guard = boundary([new Date(999).toISOString()], 1000, true);
  assert.equal(guard.render(), "merchant body");
  assert.equal(guard.timers.size, 0);
  assert.equal(guard.events.size, 0);
});
