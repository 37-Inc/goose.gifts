import { browse, photos } from "../../../../lib/catalog";

const shards = [...browse.shards, ...photos.shards,
  ...(photos.indexPath ? [{ path: photos.indexPath, payload: photos.index }] : [])];

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return shards.map((shard) => ({
    version: shard.path.split("/")[2],
    file: shard.path.split("/").at(-1)!,
  }));
}
export async function GET(
  _request: Request,
  context: { params: Promise<{ version: string; file: string }> },
) {
  const { version, file } = await context.params;
  const shard = shards.find(
    (item) => item.path === `/catalog/${version}/${file}`,
  );
  return shard
    ? Response.json(shard.payload)
    : Response.json({ status: "unavailable" }, { status: 404 });
}
