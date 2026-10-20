import { og } from "../../../lib/og-data";
import { renderOgPng } from "../../../lib/og-image";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return [...og.byPath.keys()].map((path) => ({ file: path.split("/").at(-1)! }));
}
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const card = og.byPath.get(`/og/${file}`);
  return card
    ? new Response(await renderOgPng(card) as BodyInit, { headers: { "Content-Type": "image/png" } })
    : new Response("Image unavailable", { status: 404 });
}
