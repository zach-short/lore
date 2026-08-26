
import { Chip } from "@/components/chip";
import { SectionLabel } from "@/components/section-label";
import { dismissOrHome } from "@/lib/navigation";
import { langName, topKeys } from "@/lib/lore";
import { AGG_HINTS, AGG_LABELS, AGG_ORDER, STRINGS } from "@/lib/strings";
import { Pressable, ScrollView, Text, View } from "@/tw";

import { useFilters } from "./use-filters";

const RUNTIME_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "any" },
  { value: 90, label: "≤ 90" },
  { value: 105, label: "≤ 105" },
  { value: 120, label: "≤ 120" },
  { value: 135, label: "≤ 135" },
  { value: 150, label: "≤ 150" },
  { value: 180, label: "≤ 180" },
];

export function FiltersScreen() {
  const {
    filters,
    agg,
    catalogs,
    handleToggleService,
    handleToggleDecade,
    handleToggleLang,
    handleToggleGenre,
    handleToggleRent,
    handleToggleShorts,
    handleToggleStrict,
    handleSetRuntime,
    handleSetAgg,
    handleReset,
  } = useFilters();

  const decades = Object.keys(catalogs.decades)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <View className="flex-1 bg-bg">
      <View className="w-full max-w-3xl flex-1 self-center">
        <View className="flex-row items-center justify-between px-4 pb-1 pt-4">
          <Text className="font-display text-3xl text-ink">
            {STRINGS.filters.toUpperCase()}
            <Text className="text-lamp">.</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            onPress={dismissOrHome}
            className="h-8 w-8 items-center justify-center rounded-full bg-surface-2 active:opacity-70"
          >
            <Text className="text-base text-muted">✕</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="gap-5 px-4 pb-12 pt-2">
          <View className="gap-2">
            <SectionLabel>Group scoring</SectionLabel>
            {AGG_ORDER.map((option) => {
              const isActive = option === agg;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={AGG_LABELS[option]}
                  onPress={() => handleSetAgg(option)}
                  className={
                    isActive
                      ? "gap-0.5 rounded-2xl border border-lamp bg-surface p-3"
                      : "gap-0.5 rounded-2xl border border-line bg-surface p-3 active:bg-surface-2"
                  }
                >
                  <Text
                    className={
                      isActive
                        ? "text-sm font-semibold text-lamp"
                        : "text-sm font-semibold text-ink"
                    }
                  >
                    {AGG_LABELS[option]}
                  </Text>
                  <Text className="text-xs leading-4 text-faint">
                    {AGG_HINTS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ChipSection title="Streaming on">
            {topKeys(catalogs.services, 14).map((service) => (
              <Chip
                key={service}
                label={`${service} ${catalogs.services[service]}`}
                isOn={filters.sv.includes(service)}
                onPress={() => handleToggleService(service)}
              />
            ))}
          </ChipSection>

          <ChipSection title="Options">
            <Chip label="include rentals" isOn={filters.rent} onPress={handleToggleRent} />
            <Chip
              label="include shorts (<40 min)"
              isOn={filters.shorts}
              onPress={handleToggleShorts}
            />
            <Chip
              label="strict blind spot (whole group)"
              isOn={filters.strict}
              onPress={handleToggleStrict}
            />
          </ChipSection>

          <ChipSection title="Max runtime">
            {RUNTIME_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                isOn={filters.rtmax === option.value}
                onPress={() => handleSetRuntime(option.value)}
              />
            ))}
          </ChipSection>

          <ChipSection title="Decades">
            {decades.map((decade) => (
              <Chip
                key={decade}
                label={`${decade}s`}
                isOn={filters.decades.includes(decade)}
                onPress={() => handleToggleDecade(decade)}
              />
            ))}
          </ChipSection>

          <ChipSection title="Languages">
            {topKeys(catalogs.langs, 10).map((lang) => (
              <Chip
                key={lang}
                label={langName(lang)}
                isOn={filters.langs.includes(lang)}
                onPress={() => handleToggleLang(lang)}
              />
            ))}
          </ChipSection>

          <ChipSection title="Exclude genres">
            {topKeys(catalogs.genres, 99)
              .sort()
              .map((genre) => (
                <Chip
                  key={genre}
                  label={genre}
                  isOn={filters.xg.includes(genre)}
                  onPress={() => handleToggleGenre(genre)}
                />
              ))}
          </ChipSection>

          <View className="flex-row gap-2 pt-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset all filters"
              onPress={handleReset}
              className="flex-1 items-center rounded-full border border-line bg-surface py-2.5 active:bg-surface-2"
            >
              <Text className="font-semibold text-muted">Reset</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={dismissOrHome}
              className="flex-1 items-center rounded-full bg-lamp py-2.5 active:opacity-80"
            >
              <Text className="font-semibold text-on-lamp">Done</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

type ChipSectionProps = {
  title: string;
  children: React.ReactNode;
};

function ChipSection({ title, children }: ChipSectionProps) {
  return (
    <View className="gap-2">
      <SectionLabel>{title}</SectionLabel>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}
