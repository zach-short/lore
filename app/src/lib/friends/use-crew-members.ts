import { useMemo } from "react";

import { useAuth, useProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

import { useFriends } from "./use-friends";

import type { Member } from "@/lib/lore";
import type { Profile } from "@/lib/supabase";

export type CrewMembers = {
  /** payload members in your crew (you + accepted friends), payload order */
  members: Member[];
  /** crew profiles the pipeline hasn't scored yet (they land on the next reel) */
  pendingProfiles: Profile[];
  /** true while the profile/friends reads are still in flight */
  isPending: boolean;
};

/* Your crew = you + accepted friends, matched to the payload by Letterboxd
   username. With Supabase unconfigured (local dev) the payload roster is the
   crew, exactly as before friends existed. */
export function useCrewMembers(payloadMembers: Member[]): CrewMembers {
  const { session } = useAuth();
  const profileQuery = useProfile();
  const friendsQuery = useFriends();

  return useMemo(() => {
    if (!isSupabaseConfigured || session === null) {
      return { members: payloadMembers, pendingProfiles: [], isPending: false };
    }
    const isPending = profileQuery.isPending || friendsQuery.isPending;
    if (isPending) {
      return { members: [], pendingProfiles: [], isPending: true };
    }
    const crewProfiles: Profile[] = [
      ...(profileQuery.data ? [profileQuery.data] : []),
      ...(friendsQuery.data?.friends ?? []),
    ];
    const crewUsernames = new Set(
      crewProfiles.map((p) => p.letterboxd_username.toLowerCase()),
    );
    const members = payloadMembers.filter((m) =>
      crewUsernames.has(m.username.toLowerCase()),
    );
    const scoredUsernames = new Set(members.map((m) => m.username.toLowerCase()));
    const pendingProfiles = crewProfiles.filter(
      (p) => !scoredUsernames.has(p.letterboxd_username.toLowerCase()),
    );
    return { members, pendingProfiles, isPending: false };
  }, [
    session,
    payloadMembers,
    profileQuery.isPending,
    profileQuery.data,
    friendsQuery.isPending,
    friendsQuery.data,
  ]);
}
