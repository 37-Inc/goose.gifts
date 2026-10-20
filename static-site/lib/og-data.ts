import { catalog } from "./catalog";
import { createOgRelease } from "./og";
import { siteIdentity } from "./site-identity";

// Server-only snapshot import. Clients receive only guarded page metadata/PNG.
export const og = createOgRelease(catalog, siteIdentity);
