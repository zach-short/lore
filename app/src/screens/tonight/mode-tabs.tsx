import { MODES, modeHint, STRINGS } from "@/lib/strings";
import { Link, Pressable, Text, View } from "@/tw";

import type { Mode } from "@/lib/lore";

type ModeTabsProps = {
  mode: Mode;
  isStrict: boolean;
  resultCount: number;
  activeFilterCount: number;
  onSelectMode: (mode: Mode) => void;
};

export function ModeTabs({
  mode,
  isStrict,
  resultCount,
  activeFilterCount,
  onSelectMode,
}: ModeTabsProps) {
  return (
    <View className="gap-2">
      <View className="flex-row rounded-2xl border border-line bg-surface p-1">
        {MODES.map((entry) => {
          const isActive = entry.key === mode;
          return (
            <Pressable
              key={entry.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={entry.label}
              onPress={() => onSelectMode(entry.key)}
              className={
                isActive
                  ? "flex-1 items-center rounded-xl bg-surface-2 py-2"
                  : "flex-1 items-center rounded-xl py-2 active:bg-surface-2"
              }
            >
              <Text
                className={
                  isActive
                    ? "font-display text-base tracking-wide text-ink"
                    : "font-display text-base tracking-wide text-faint"
                }
              >
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 text-xs leading-4 text-faint">
          {modeHint(mode, isStrict)}  ·  {STRINGS.candidates(resultCount)}
        </Text>
        <Link href="/filters" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${STRINGS.filters}${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}
            className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 active:bg-surface-2"
          >
            <Text className="font-display text-sm tracking-[2px] text-ink uppercase">
              {STRINGS.filters}
            </Text>
            {activeFilterCount ? (
              <View className="min-w-5 items-center rounded-full bg-lamp px-1.5 py-0.5">
                <Text className="text-xs font-bold text-on-lamp">
                  {activeFilterCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </Link>
      </View>
    </View>
  );
}
