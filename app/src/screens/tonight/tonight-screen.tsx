import { FlashList } from "@shopify/flash-list";
import { useCallback } from "react";
import { Platform } from "react-native";

import { DataEmpty, DataError, DataLoading } from "@/components/data-state";
import { LogoMark } from "@/components/logo-mark";
import { ScreenShell } from "@/components/screen-shell";
import { SectionLabel } from "@/components/section-label";
import { STRINGS } from "@/lib/strings";
import { Text, View } from "@/tw";

import { FilmCard } from "./film-card";
import { HeadlinerCard } from "./headliner-card";
import { MemberPicker } from "./member-picker";
import { ModeTabs } from "./mode-tabs";
import { useTonight } from "./use-tonight";

import type { ScoredFilm } from "@/lib/lore";

export function TonightScreen() {
  const {
    query,
    isLoading,
    hasPayloadMembers,
    data,
    members,
    subset,
    results,
    cardContext,
    note,
    mode,
    agg,
    filters,
    activeFilterCount,
    handleToggleMember,
    handleSetMode,
  } = useTonight();

  const renderItem = useCallback(
    ({ item, index }: { item: ScoredFilm; index: number }) => (
      <FilmCard item={item} rank={index + 2} ctx={cardContext} />
    ),
    [cardContext],
  );

  if (isLoading) {
    return (
      <ScreenShell>
        <DataLoading />
      </ScreenShell>
    );
  }
  if (query.isError || !data) {
    return (
      <ScreenShell>
        <DataError
          message={query.error instanceof Error ? query.error.message : "Couldn’t load the data."}
          onRetry={() => query.refetch()}
        />
      </ScreenShell>
    );
  }
  if (!hasPayloadMembers || !data.films.length) {
    return (
      <ScreenShell>
        <DataEmpty
          title={STRINGS.noData.title}
          bodySlot={
            <Text className="text-center text-sm text-muted">{STRINGS.noData.body}</Text>
          }
        />
      </ScreenShell>
    );
  }
  if (!members.length) {
    /* The reel has members, just none of them yours yet — new signup whose
       scores land on the next pipeline run, before adding any friends. */
    return (
      <ScreenShell>
        <DataEmpty
          title={STRINGS.noCrew.title}
          bodySlot={
            <Text className="text-center text-sm text-muted">{STRINGS.noCrew.body}</Text>
          }
        />
      </ScreenShell>
    );
  }

  const emptyResults = !subset.length ? (
    <DataEmpty title={STRINGS.noSubset.title} />
  ) : (
    <DataEmpty
      title={STRINGS.noResults.title}
      bodySlot={
        <Text className="text-center text-sm text-muted">
          {mode === "evangelist" && subset.length < 2
            ? STRINGS.noResultsEvangelist
            : STRINGS.noResultsFilters(agg === "avg_nomisery")}
        </Text>
      }
    />
  );

  const [headliner, ...undercard] = results;

  return (
    <ScreenShell>
      <View className="gap-3 px-4 pb-3 pt-2">
        {Platform.OS !== "web" ? <Wordmark generatedAt={data.generated_at} /> : null}
        <MemberPicker
          members={members}
          subset={subset}
          note={note}
          onToggle={handleToggleMember}
        />
        <ModeTabs
          mode={mode}
          isStrict={filters.strict}
          resultCount={results.length}
          activeFilterCount={activeFilterCount}
          onSelectMode={handleSetMode}
        />
      </View>
      <FlashList
        data={undercard}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.film.id)}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          headliner ? (
            <View className="pb-1">
              <HeadlinerCard item={headliner} ctx={cardContext} />
              {undercard.length ? (
                <SectionLabel className="pb-2 pt-1">{STRINGS.runnersUp}</SectionLabel>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={emptyResults}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: Platform.OS === "web" ? 32 : 120,
        }}
      />
    </ScreenShell>
  );
}

type WordmarkProps = { generatedAt: string };

function Wordmark({ generatedAt }: WordmarkProps) {
  return (
    <View className="flex-row items-end justify-between">
      <View className="flex-row items-center gap-2">
        <LogoMark className="h-9 w-9" />
        <Text className="font-display text-4xl leading-10 text-ink">
          {STRINGS.appName.toUpperCase()}
          <Text className="text-lamp">.</Text>
        </Text>
      </View>
      <Text className="pb-1 text-xs text-faint">{reelDate(generatedAt)}</Text>
    </View>
  );
}

function Separator() {
  return <View className="h-2" />;
}

export function reelDate(generatedAt: string): string {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return "";
  return `reel: ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
