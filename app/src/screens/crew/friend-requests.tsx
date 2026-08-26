import { SectionLabel } from "@/components/section-label";
import { useAuth } from "@/lib/auth";
import { useFriendActions, useFriends } from "@/lib/friends";
import { STRINGS } from "@/lib/strings";
import { Text, View } from "@/tw";

import { ProfileRow, RowButton } from "./friend-rows";

/** Incoming requests to answer, outgoing ones to wait on (or take back). */
export function FriendRequests() {
  const { session } = useAuth();
  const friendsQuery = useFriends();
  const { accept, remove } = useFriendActions();

  const incoming = friendsQuery.data?.incoming ?? [];
  const outgoing = friendsQuery.data?.outgoing ?? [];
  if (!session || (!incoming.length && !outgoing.length)) return null;

  const actionError =
    accept.error instanceof Error
      ? accept.error
      : remove.error instanceof Error
        ? remove.error
        : null;

  return (
    <View className="gap-2">
      <SectionLabel>{STRINGS.friends.requestsTitle}</SectionLabel>
      {incoming.map((edge) => (
        <ProfileRow
          key={edge.id}
          profile={edge.requester}
          actionsSlot={
            <View className="flex-row gap-2">
              <RowButton
                label={STRINGS.friends.accept}
                isPrimary
                isDisabled={accept.isPending}
                onPress={() => accept.mutate(edge.id)}
              />
              <RowButton
                label={STRINGS.friends.decline}
                isDisabled={remove.isPending}
                onPress={() => remove.mutate(edge.id)}
              />
            </View>
          }
        />
      ))}
      {outgoing.map((edge) => (
        <ProfileRow
          key={edge.id}
          profile={edge.addressee}
          noteSlot={
            <Text className="text-xs text-faint">
              {STRINGS.friends.waitingOn(
                edge.addressee.display_name ?? edge.addressee.letterboxd_username,
              )}
            </Text>
          }
          actionsSlot={
            <RowButton
              label={STRINGS.friends.cancelRequest}
              isDisabled={remove.isPending}
              onPress={() => remove.mutate(edge.id)}
            />
          }
        />
      ))}
      {actionError ? (
        <Text className="text-xs text-wild">{actionError.message}</Text>
      ) : null}
    </View>
  );
}
