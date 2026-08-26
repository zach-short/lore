import {
  isSupabaseConfigured,
  supabase,
  supabaseKey,
  supabaseUrl,
} from "@/lib/supabase";

import { parseLoreData } from "./parse";

import type { LoreData } from "@/lib/lore";

/* The pipeline's `lore publish` step drops site/data.json into the
   private site-data bucket after every run, so signed-in members always read
   the freshest reel — no app redeploy per pipeline run. A plain fetch against
   the authenticated storage endpoint works identically on native and web
   (supabase-js's .download() returns a Blob, which React Native can't read).
   Any miss — unconfigured, signed out, not yet published, offline — returns
   null and the platform loaders fall back to their bundled payloads. */
export async function fetchPublishedData(): Promise<LoreData | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/authenticated/site-data/data.json`,
      {
        headers: {
          apikey: supabaseKey ?? "",
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
      },
    );
    if (!response.ok) return null;
    return parseLoreData(await response.json());
  } catch {
    return null;
  }
}
