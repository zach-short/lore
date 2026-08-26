
import { Pressable, Text } from "@/tw";

type ChipProps = {
  label: string;
  isOn: boolean;
  hint?: string;
  onPress: () => void;
};

/** Toggle chip used for members and every filter dimension. */
export function Chip({ label, isOn, hint, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isOn }}
      accessibilityLabel={hint ?? label}
      onPress={onPress}
      className={
        isOn
          ? "rounded-full border border-lamp bg-lamp px-3 py-1.5 active:opacity-80"
          : "rounded-full border border-line bg-surface px-3 py-1.5 active:bg-surface-2"
      }
    >
      <Text
        className={
          isOn ? "text-sm font-semibold text-on-lamp" : "text-sm text-muted"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
