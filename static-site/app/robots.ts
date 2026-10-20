import type { MetadataRoute } from "next";
import { isFixtureRelease } from "../lib/catalog";
import { isSitePreview, siteIdentity } from "../lib/site-identity";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return isSitePreview || isFixtureRelease
    ? { rules: { userAgent: "*", disallow: "/" } }
    : { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/safe/", "/preview/"] },
      sitemap: `${siteIdentity.origin}/sitemap.xml` };
}
