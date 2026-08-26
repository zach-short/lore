import { useState } from "react";
import { useColorScheme } from "react-native";

import { SectionLabel } from "@/components/section-label";
import { useFriendActions, useFriendSearch, useFriends } from "@/lib/friends";
import { STRINGS } from "@/lib/strings";
import { paletteFor } from "@/theme";
import { Text, TextInput, View } from "@/tw";

import { ProfileRow, RowButton } from "./friend-rows";

/** Search the signup roster by Letterboxd handle and send requests. */
export function FriendSearch() {
  const scheme = useColorScheme();
  const [term, setTerm] = useState("");
  const searchQuery = useFriendSearch(term);
  const friendsQuery = useFriends();
  const { request } = useFriendActions();

  const linkedIds = friendsQuery.data?.linkedIds ?? new Set<string>();
  const results = (searchQuery.data ?? []).filter((p) => !linkedIds.has(p.id));
  const hasSearched = term.trim().length >= 2 && !searchQuery.isPending;

  return (
    <View className="gap-2">
      <SectionLabel>{STRINGS.friends.addTitle}</SectionLabel>
      <TextInput
        value={term}
        onChangeText={setTerm}
        placeholder={STRINGS.friends.searchPlaceholder}
        placeholderTextColor={paletteFor(scheme).faint}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={STRINGS.friends.searchPlaceholder}
        className="rounded-2xl border border-line bg-surface px-4 py-3 text-base text-ink"
      />
      {results.map((profile) => (
        <ProfileRow
          key={profile.id}
          profile={profile}
          actionsSlot={
            <RowButton
              label={STRINGS.friends.add}
              isPrimary
              isDisabled={request.isPending}
              onPress={() => request.mutate(profile.id)}
            />
          }
        />
      ))}
      {hasSearched && !results.length ? (
        <Text className="text-xs text-faint">{STRINGS.friends.searchEmpty}</Text>
      ) : null}
      {request.error instanceof Error ? (
        <Text className="text-xs text-wild">{request.error.message}</Text>
      ) : null}
      <Text className="text-xs leading-4 text-faint">
        {STRINGS.friends.searchHint}
      </Text>
    </View>
  );
}
