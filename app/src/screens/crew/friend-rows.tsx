import { Pressable, Text, View } from "@/tw";

import type { Profile } from "@/lib/supabase";
import type { ReactNode } from "react";

type ProfileRowProps = {
  profile: Profile;
  noteSlot?: ReactNode;
  actionsSlot?: ReactNode;
};

/** One person, one line: name + handle on the left, actions on the right. */
export function ProfileRow({ profile, noteSlot, actionsSlot }: ProfileRowProps) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-ink">
          {profile.display_name ?? profile.letterboxd_username}
        </Text>
        <Text className="text-xs text-muted">
          @{profile.letterboxd_username}
        </Text>
        {noteSlot}
      </View>
      {actionsSlot}
    </View>
  );
}

type RowButtonProps = {
  label: string;
  isPrimary?: boolean;
  isDisabled?: boolean;
  onPress: () => void;
};

export function RowButton({
  label,
  isPrimary = false,
  isDisabled = false,
  onPress,
}: RowButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      className={
        isPrimary
          ? "rounded-full bg-lamp px-3.5 py-1.5 active:opacity-80"
          : "rounded-full border border-line bg-surface px-3.5 py-1.5 active:bg-surface-2"
      }
      style={isDisabled ? { opacity: 0.5 } : undefined}
    >
      <Text
        className={
          isPrimary ? "text-sm font-semibold text-on-lamp" : "text-sm text-muted"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
