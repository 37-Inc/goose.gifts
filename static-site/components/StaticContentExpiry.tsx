"use client";

import { useEffect, useState } from "react";

/** Worker guards remain authoritative for requests. This also clears merchant
 * bodies in a tab that stays open across a displayed product's deadline.
 * Read the server-rendered deadline attributes, never embed a catalog in JS.
 * Interactive search/feed/random views already guard their later-loaded data.
 */
export function StaticContentExpiry({ children, fallback }: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    // Presentation has its own timer and preserves the episode's original
    // identity/variant in its unavailable state. Do not replace that archive.
    if (document.querySelector("#main .presentation")) return;
    const deadlines = Array.from(document.querySelectorAll("#main [data-analytics-expiry]"))
      .map((element) => Date.parse(element.getAttribute("data-analytics-expiry") || ""))
      .filter(Number.isFinite);
    if (!deadlines.length) return;
    const deadline = Math.min(...deadlines);
    let timer: number;
    const check = () => {
      window.clearTimeout(timer);
      const remaining = deadline - Date.now();
      if (remaining <= 0) setExpired(true);
      else timer = window.setTimeout(check, Math.min(2_147_483_647, remaining));
    };
    check();
    // Background tabs can throttle timers; check again before restored content
    // is used, including browser back/forward cache restoration.
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return expired ? fallback : children;
}
