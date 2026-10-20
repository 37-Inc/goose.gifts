import { notFound } from "next/navigation";
import { show } from "../../../../lib/show-data";
import { SafeEpisode } from "../../../../components/SafeEpisode";

export const dynamicParams = false;
export function generateStaticParams() { return show.episodes.map(({ key }) => ({ episode: key })); }
export default async function Safe({ params }: { params: Promise<{ episode: string }> }) {
  const { episode: key } = await params;
  const episode = show.episodes.find((item) => item.key === key);
  if (!episode) notFound();
  return <SafeEpisode episode={episode} />;
}
