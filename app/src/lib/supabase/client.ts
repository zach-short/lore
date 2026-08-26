import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

/* Env comes from app/.env (EXPO_PUBLIC_* is inlined at bundle time). When the
   keys are missing the app runs open, exactly as it did before auth existed:
   the bundled data.json was never secret, so a lockout would protect nothing
   while breaking local dev. `isSupabaseConfigured` is the single switch the
   layout and screens key off. */
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

/* On web the storage option stays unset: supabase-js's default is localStorage
   behind an is-browser guard, which keeps Expo Router's Node prerender happy —
   the AsyncStorage web shim touches `window` at import time and crashes it. */
export const supabase = createClient(
  supabaseUrl || "https://unconfigured.invalid",
  supabaseKey || "unconfigured",
  {
    auth: {
      ...(Platform.OS === "web" ? {} : { storage: AsyncStorage }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/* Native has no visibility events supabase-js understands; refresh tokens only
   while the app is foregrounded, per the Supabase Expo guide. */
if (Platform.OS !== "web" && isSupabaseConfigured) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
