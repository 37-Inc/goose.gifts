import assert from "node:assert/strict";
import test from "node:test";
import { documentAssets } from "../static-site/lib/document-output.ts";

const bytes = value => new TextEncoder().encode(value);
function fixture() {
  const input = new Map([
    ["/index.html", bytes("HTML with inline self.__next_f hydration")],
    ["/index.txt", bytes('0:{"flight":"home"}')],
    ["/__next._tree.txt", bytes('1:{"flight":"tree"}')],
    ["/gifts/one.html", bytes("Product HTML")],
    ["/gifts/one.txt", bytes('0:{"flight":"product"}')],
    ["/gifts/one/__next.gifts.$d$slug.__PAGE__.txt", bytes('a:{"flight":"product"}')],
    ["/safe/product.html", bytes("Safe HTML")],
    ["/safe/product.txt", bytes('0:{"flight":"safe"}')],
    ["/safe/asset.txt", bytes("Reload")],
    ["/privacy.txt", bytes('0:{"flight":"privacy"}')],
    ["/robots.txt", bytes("User-agent: *")],
    ["/license.txt", bytes("Licensed original")],
    ["/og/one.png", bytes("PNG")],
    ["/_next/static/app.js", bytes("Hydration JS")],
  ]);
  const routes = Object.fromEntries([...input.keys()].filter(name => name.endsWith(".txt") && name !== "/license.txt")
    .map(name => [name, { assetPath: name, safeAssetPath: "/safe/product.txt", eligibleUntil: null, state: "ready" }]));
  return { input, routes };
}

test("document output omits only recognized routed Flight companions with real HTML", () => {
  const { input, routes } = fixture(), original = new Map(input);
  const output = documentAssets(input, routes);
  assert.deepEqual([...input], [...original]);
  assert.deepEqual([...output.keys()], [...input.keys()].filter(name => ![
    "/index.txt", "/__next._tree.txt", "/gifts/one.txt", "/gifts/one/__next.gifts.$d$slug.__PAGE__.txt",
  ].includes(name)));
  for (const [name, value] of output) assert.equal(value, input.get(name), name);
});

test("unrecognized payload bytes, companion names or missing HTML fail closed", () => {
  for (const mutate of [
    ({ input }) => input.delete("/gifts/one.html"),
    ({ input }) => input.set("/gifts/one.txt", bytes("Not generated Flight")),
    ({ input, routes }) => {
      const name = "/gifts/one/__next.new/shape.txt";
      input.set(name, bytes('0:{}')); routes[name] = routes["/gifts/one.txt"];
    },
    ({ input, routes }) => {
      const name = "/gifts/one/__next.future.txt";
      input.set(name, bytes('0:{}')); routes[name] = routes["/gifts/one.txt"];
    },
  ]) {
    const data = fixture(); mutate(data);
    assert.throws(() => documentAssets(data.input, data.routes), /Unrecognized standalone Flight/);
  }
});
