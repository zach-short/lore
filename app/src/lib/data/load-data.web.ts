import { parseLoreData } from "./parse";
import { fetchPublishedData } from "./remote-data";

import type { LoreData } from "@/lib/lore";

/* Web: prefer the payload the pipeline published to Supabase, fall back to
   the same-origin copy from public/data.json (dev server and static export
   alike) so the app still works before the first publish. The web bundle
   never carries the 1.8 MB snapshot. */

export async function loadLoreData(): Promise<LoreData> {
  const published = await fetchPublishedData();
  if (published) return published;
  const response = await fetch("/data.json", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `data.json not found (${response.status}) — run \`bun run sync-data\` in app/ after building the pipeline.`,
    );
  }
  return parseLoreData(await response.json());
}
