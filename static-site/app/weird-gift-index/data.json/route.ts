import { catalog } from "../../../lib/catalog";
import { buildSnapshotIndex } from "../../../lib/weird-index";
export const dynamic = "force-static";
export function GET() {
  return Response.json(buildSnapshotIndex(catalog));
}
