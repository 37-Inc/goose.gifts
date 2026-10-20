import { createElement as h } from "react";
import { ImageResponse } from "next/og";
import type { OgCard } from "./og";

/** Code-native typography/shapes only. No images, URLs, remote fonts or providers. */
export async function renderOgPng(card: OgCard): Promise<Uint8Array> {
  const label = card.kind === "guide" ? "GIFT GUIDE" : card.kind === "fixture"
    ? "ILLUSTRATIVE EXAMPLE / NOT FOR SALE" : card.kind === "product" ? "FROM THE COLLECTION" : "CAREFULLY CONSIDERED";
  const response = new ImageResponse(h("div", { style: {
    width: "100%", height: "100%", display: "flex", flexDirection: "column",
    background: "#f8f6ef", color: "#22231f", padding: "54px 64px", fontWeight: 400,
  } },
  h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 } },
    h("span", null, card.identity.name),
    h("div", { style: { display: "flex", gap: 10 } }, ...[0, 1, 2].map((key) =>
      h("div", { key, style: { width: 14, height: 14, borderRadius: 7, background: key === 0 ? "#c2410c" : "#d9d9cf" } })))),
  h("div", { style: { display: "flex", marginTop: 65, color: "#66685e", fontSize: 16, letterSpacing: 3 } }, label),
  h("div", { style: { display: "flex", marginTop: 22, fontSize: card.title.length > 140 ? 42 : card.title.length > 105 ? 48 : card.title.length > 65 ? 58 : 74,
    letterSpacing: -2, lineHeight: 1.08 } }, card.title),
  h("div", { style: { display: "flex", marginTop: "auto", paddingTop: 20, borderTop: "1px solid #d9d9cf",
    justifyContent: "space-between", alignItems: "center", fontSize: 20, color: "#66685e" } },
    h("span", null, new URL(card.identity.origin).host),
    h("div", { style: { width: 80, height: 5, background: "#c2410c" } }))),
  { width: 1200, height: 630 });
  return new Uint8Array(await response.arrayBuffer());
}
