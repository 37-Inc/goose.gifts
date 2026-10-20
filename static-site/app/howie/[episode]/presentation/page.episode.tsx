import { notFound } from "next/navigation";
import { show } from "../../../../lib/show-data";
import { previewMetadata } from "../../../../lib/metadata";
import { Presentation } from "../../../../components/Presentation";
import { episodeQrSvg } from "../../../../lib/episode-qr";

export const dynamicParams = false;
export function generateStaticParams() { return show.episodes.map(({ key }) => ({ episode: key })); }
export async function generateMetadata({ params }: { params: Promise<{ episode: string }> }) {
  const { episode: key } = await params;
  return previewMetadata("Episode presentation", "The original episode selection, in order.", `/howie/${key}`);
}
export default async function EpisodePresentation({ params }: { params: Promise<{ episode: string }> }) {
  const { episode: key } = await params;
  const episode = show.episodes.find((item) => item.key === key);
  if (!episode) notFound();
  return <main id="main" className="presentation-main"><Presentation episode={episode} qrSvg={episodeQrSvg(episode)} /></main>;
}
