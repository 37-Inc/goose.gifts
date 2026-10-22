import type { DisplayEpisode } from "../lib/episode-display";
import { episodeQrSvg } from "../lib/episode-qr";
import { siteIdentity } from "../lib/site-identity";

export function EpisodeShare({ episode }: { episode: DisplayEpisode }) {
  const svg = episodeQrSvg(episode);
  if (!svg || !episode.shareUrl) return null;
  return (
    <aside className="episode-share">
      <a className="episode-qr" href={episode.shareUrl} aria-label="Open this episode selection"
        dangerouslySetInnerHTML={{ __html: svg }} />
      <div><h2>Keep this selection.</h2>
        <a className="text-action" href={episode.shareUrl}>{`${siteIdentity.hostname}/howie/${episode.key}`}</a>
        <p className="quiet">A useful episode page. Never an automatic retailer redirect.</p>
      </div>
    </aside>
  );
}
