import { browse } from "../../../../lib/catalog";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return browse.shards.map((shard) => ({
    version: browse.version,
    file: shard.path.split("/").at(-1)!,
  }));
}
export async function GET(
  _request: Request,
  context: { params: Promise<{ version: string; file: string }> },
) {
  const { version, file } = await context.params;
  const shard = browse.shards.find(
    (item) => item.path === `/catalog/${version}/${file}`,
  );
  return shard
    ? Response.json(shard.payload)
    : Response.json({ status: "unavailable" }, { status: 404 });
}
