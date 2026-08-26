import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/data/query-keys";
import { supabase } from "@/lib/supabase";

import { useAuth } from "./auth-context";

import type { Profile } from "@/lib/supabase";

/** The signed-in member's own profiles row; null until onboarding creates it. */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: queryKeys.auth.profile(userId ?? "anonymous"),
    enabled: userId !== null,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
