import { previewMetadata } from "../../lib/metadata";
import { show } from "../../lib/show-data";
import { EpisodeArchive, EpisodeContent } from "../../components/EpisodeContent";
import { episodePath } from "../../lib/show";
import { isFixtureRelease } from "../../lib/catalog";
export const metadata = previewMetadata(
  "From the show",
  show.latest ? "The current confirmed episode selection and stable previous selections."
    : "No episode selection has been published. Confirmed products will appear here when ready.",
  "/howie",
  { indexable: Boolean(show.latest), fixture: isFixtureRelease },
);
export default function Howie() {
  if (show.latest) return (
    <main id="main" className="site-main episode-page">
      <div className="episode-heading">
        <p className="eyebrow">From the show · {show.latest.episodeDate}</p>
        <h1>The latest questionable decisions.</h1>
        <a className="text-action" href={episodePath(show.latest.key)}>
          {show.latest.title} · Stable episode page ↗
        </a>
      </div>
      <EpisodeContent episode={show.latest} />
      <EpisodeArchive episodes={show.episodes} current={show.latest.key} />
    </main>
  );
  return (
    <main id="main" className="site-main empty-state">
      <p className="eyebrow">From the show</p>
      <h1>Nothing to announce. Yet.</h1>
      <p>
        No episode selection has been published. When there is a confirmed
        selection, you’ll find the exact products here.
      </p>
      <a className="button" href="/gifts">
        Explore the collection ↗
      </a>
    </main>
  );
}
