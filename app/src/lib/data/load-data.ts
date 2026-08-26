import { parseLoreData } from "./parse";
import { fetchPublishedData } from "./remote-data";

import type { LoreData } from "@/lib/lore";

/* Native: prefer the payload the pipeline published to Supabase, fall back to
   the snapshot bundled at build time (scripts/sync-data.mjs) so the app works
   offline and before the first publish. */

// Metro bundles JSON via require; import would need a type shim for a generated file.
const snapshot = require("./snapshot.json") as unknown;

export async function loadLoreData(): Promise<LoreData> {
  const published = await fetchPublishedData();
  if (published) return published;
  return parseLoreData(snapshot);
}
