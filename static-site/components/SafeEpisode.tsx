import type { DisplayEpisode } from "../lib/episode-display";
import { EpisodeContent } from "./EpisodeContent";
import { unavailableEpisode } from "../lib/episode-display";

export function SafeEpisode({ episode }: { episode: DisplayEpisode }) {
  return <main id="main" className="site-main episode-page">
    <div className="episode-heading"><p className="eyebrow">Episode archive · {episode.episodeDate}</p>
      <h1>{episode.title}</h1>
      <p>The original selection record is preserved. Product content is being checked; no expired offers or images are displayed.</p>
    </div>
    <EpisodeContent episode={unavailableEpisode(episode)} />
    <a className="text-action" href="/howie">Latest episode selections →</a>
  </main>;
}
