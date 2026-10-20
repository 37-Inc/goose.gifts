import qrcode from "qrcode-generator";
import type { DisplayEpisode } from "./episode-display";
import { siteIdentity } from "./site-identity";

/** Server-only deterministic SVG; canonical site page, never an affiliate redirect. */
export function episodeQrSvg(episode: DisplayEpisode): string | null {
  if (episode.status !== "published" || !episode.shareUrl) return null;
  const url = new URL(episode.shareUrl);
  if (url.origin !== siteIdentity.origin || url.pathname !== `/howie/${episode.key}`
    || url.username || url.password || url.hash
    || [...url.searchParams.keys()].join(",") !== "utm_source,utm_medium,utm_campaign"
    || url.searchParams.get("utm_source") !== "howie_mandel_does_stuff"
    || url.searchParams.get("utm_medium") !== "podcast"
    || url.searchParams.get("utm_campaign") !== `episode_${episode.episodeDate?.replaceAll("-", "_")}`)
    throw new Error("Invalid episode QR target");
  const qr = qrcode(0, "M");
  qr.addData(url.href, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
}
