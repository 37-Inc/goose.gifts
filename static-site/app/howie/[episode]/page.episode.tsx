import { notFound } from "next/navigation";
import { show } from "../../../lib/show-data";
import { episodePath } from "../../../lib/show";
import { previewMetadata } from "../../../lib/metadata";
import { EpisodeArchive, EpisodeContent } from "../../../components/EpisodeContent";
import { EpisodeShare } from "../../../components/EpisodeShare";
import { isFixtureRelease } from "../../../lib/catalog";

export const dynamicParams = false;
export function generateStaticParams() { return show.episodes.map(({ key }) => ({ episode: key })); }
export async function generateMetadata({ params }: { params: Promise<{ episode: string }> }) {
  const { episode: key } = await params;
  const episode = show.episodes.find((item) => item.key === key);
  return previewMetadata(episode?.title || "Episode unavailable",
    "The original selections, exact variants and separately labeled alternatives.", episodePath(key),
    { indexable: Boolean(episode), fixture: isFixtureRelease });
}
export default async function Episode({ params }: { params: Promise<{ episode: string }> }) {
  const { episode: key } = await params;
  const episode = show.episodes.find((item) => item.key === key);
  if (!episode) notFound();
  return (
    <main id="main" className="site-main episode-page">
      <div className="episode-heading">
        <a className="back-link" href="/howie">← All episode selections</a>
        <p className="eyebrow">Episode selection · {episode.episodeDate}</p>
        <h1>{episode.title}</h1>
        <a className="text-action" href={`${episodePath(key)}/presentation`}>Presentation view</a>
      </div>
      <EpisodeContent episode={episode} />
      <EpisodeShare episode={episode} />
      <EpisodeArchive episodes={show.episodes} current={key} />
    </main>
  );
}
