import { Platform } from "react-native";

import { DataEmpty, DataError, DataLoading } from "@/components/data-state";
import { ScreenShell } from "@/components/screen-shell";
import { SectionLabel } from "@/components/section-label";
import { useLoreData } from "@/lib/data";
import { useCrewMembers, useFriendActions, useFriends } from "@/lib/friends";
import { STRINGS } from "@/lib/strings";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Pressable, ScrollView, Text, View } from "@/tw";

import { FriendRequests } from "./friend-requests";
import { FriendSearch } from "./friend-search";
import { ProfileRow } from "./friend-rows";
import { MemberCard } from "./member-card";

import type { LoreData } from "@/lib/lore";

type RemoveFriendLinkProps = {
  label: string;
  isDisabled: boolean;
  onPress: () => void;
};

function RemoveFriendLink({ label, isDisabled, onPress }: RemoveFriendLinkProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      className="self-end pr-1"
    >
      <Text className="text-xs text-faint">{label}</Text>
    </Pressable>
  );
}

export function CrewScreen() {
  const query = useLoreData();

  let body;
  if (query.isPending) {
    body = <DataLoading />;
  } else if (query.isError || !query.data) {
    body = (
      <DataError
        message={query.error instanceof Error ? query.error.message : "Couldn’t load the data."}
        onRetry={() => query.refetch()}
      />
    );
  } else if (!isSupabaseConfigured && !query.data.members.length) {
    body = <DataEmpty title={STRINGS.noData.title} />;
  } else {
    body = <CrewBody data={query.data} />;
  }

  return <ScreenShell>{body}</ScreenShell>;
}

type CrewBodyProps = { data: LoreData };

function CrewBody({ data }: CrewBodyProps) {
  const crew = useCrewMembers(data.members);
  const friendsQuery = useFriends();
  const { remove } = useFriendActions();

  if (crew.isPending) return <DataLoading />;

  /* Unfriending needs the accepted edge; look it up per crew profile. */
  const friends = friendsQuery.data;
  const edgeIdForUsername = (username: string): string | null => {
    const profile = (friends?.friends ?? []).find(
      (p) => p.letterboxd_username.toLowerCase() === username.toLowerCase(),
    );
    return profile ? (friends?.edgeIdByFriendId[profile.id] ?? null) : null;
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{
        paddingBottom: Platform.OS === "web" ? 48 : 120,
      }}
    >
      {Platform.OS !== "web" ? (
        <Text className="font-display text-4xl leading-10 text-ink">
          {STRINGS.crewTitle.toUpperCase()}
          <Text className="text-lamp">.</Text>
        </Text>
      ) : null}

      {isSupabaseConfigured ? (
        <>
          <View className="gap-3">
            <SectionLabel>{STRINGS.friends.crewTitle}</SectionLabel>
            {crew.members.map((member) => {
              const edgeId = edgeIdForUsername(member.username);
              return (
                <View key={member.id} className="gap-1">
                  <MemberCard member={member} />
                  {edgeId ? (
                    <RemoveFriendLink
                      label={`${STRINGS.friends.removeFriend} @${member.username}`}
                      isDisabled={remove.isPending}
                      onPress={() => remove.mutate(edgeId)}
                    />
                  ) : null}
                </View>
              );
            })}
            {crew.pendingProfiles.map((profile) => {
              const edgeId = friends?.edgeIdByFriendId[profile.id] ?? null;
              return (
                <View key={profile.id} className="gap-1">
                  <ProfileRow
                    profile={profile}
                    noteSlot={
                      <Text className="text-xs text-faint">
                        {STRINGS.friends.onNextReel}
                      </Text>
                    }
                  />
                  {edgeId ? (
                    <RemoveFriendLink
                      label={`${STRINGS.friends.removeFriend} @${profile.letterboxd_username}`}
                      isDisabled={remove.isPending}
                      onPress={() => remove.mutate(edgeId)}
                    />
                  ) : null}
                </View>
              );
            })}
            {crew.members.length + crew.pendingProfiles.length <= 1 ? (
              <Text className="text-xs leading-4 text-faint">
                {STRINGS.friends.emptyCrew}
              </Text>
            ) : null}
          </View>
          <FriendRequests />
          <FriendSearch />
        </>
      ) : (
        data.members.map((member) => (
          <MemberCard key={member.id} member={member} />
        ))
      )}

      {data.veto?.length ? (
        <View className="gap-1 pt-2">
          <SectionLabel>Vetoed</SectionLabel>
          {data.veto.map((veto, index) => (
            <Text key={veto.slug ?? index} className="text-xs text-muted">
              {veto.title ?? veto.slug}
              {veto.by ? ` — ${veto.by}` : ""}
              {veto.why ? ` (${veto.why})` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="gap-1 pt-2">
        <SectionLabel>The projector</SectionLabel>
        <Text className="text-xs leading-4 text-faint">
          Scores are precomputed by the lore pipeline from everyone’s
          Letterboxd exports and public RSS — model {data.model_version},
          reel from {new Date(data.generated_at).toLocaleString()}. Picking a
          different crew or filter re-ranks instantly on this device; nothing
          phones home.
        </Text>
        <Text className="text-xs leading-4 text-faint">{STRINGS.attribution}</Text>
      </View>

      {isSupabaseConfigured ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STRINGS.friends.signOut}
          onPress={() => {
            supabase.auth.signOut().catch(() => {
              /* a failed sign-out keeps the session; nothing useful to do */
            });
          }}
          className="self-start pb-2"
        >
          <Text className="text-xs text-lamp">{STRINGS.friends.signOut}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
