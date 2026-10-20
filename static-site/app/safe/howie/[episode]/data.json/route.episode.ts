import { show } from "../../../../../lib/show-data";
import { unavailableEpisode } from "../../../../../lib/episode-display";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() { return show.episodes.map(({ key }) => ({ episode: key })); }
export async function GET(_request: Request, { params }: { params: Promise<{ episode: string }> }) {
  const { episode: key } = await params;
  const episode = show.episodes.find((item) => item.key === key);
  return episode ? Response.json({ ...unavailableEpisode(episode), availability: "unavailable" }) : new Response(null, { status: 404 });
}
