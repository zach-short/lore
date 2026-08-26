import { memo } from "react";

import { MemberScoreChips } from "@/components/member-score-chips";
import { Poster } from "@/components/poster";
import { Stars } from "@/components/stars";
import { metaLine, providerSummary, reasonFor } from "@/lib/movienight";
import { STRINGS } from "@/lib/strings";
import { Link, Pressable, Text, View } from "@/tw";

import type { ScoredFilm } from "@/lib/movienight";
import type { CardContext } from "./use-tonight";

type FilmCardProps = {
  item: ScoredFilm;
  rank: number;
  ctx: CardContext;
};

function FilmCardBase({ item, rank, ctx }: FilmCardProps) {
  const { film, result } = item;
  const providers = providerSummary(film.pv, ctx.region);
  const reason = reasonFor(film, result, ctx);

  return (
    <Link href={`/film/${film.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${film.title}, ranked ${rank}`}
        className="flex-row gap-3 rounded-2xl border border-line bg-surface p-3 active:bg-surface-2"
      >
        <View className="w-8 items-center pt-1">
          <Text className="font-display text-xl text-faint">{rank}</Text>
        </View>
        <Poster path={film.poster} title={film.title} width="w185" className="w-14" />
        <View className="flex-1 gap-1">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text numberOfLines={1} className="flex-1 text-base font-semibold text-ink">
              {film.title}
            </Text>
            {result.star != null ? <Stars value={result.star} /> : null}
          </View>
          <Text numberOfLines={1} className="text-xs text-muted">
            {metaLine(film)}
          </Text>
          <Text numberOfLines={1} className="text-xs text-muted">
            {providers.label}
            {providers.isAttributed ? (
              <Text className="text-faint">  {STRINGS.justWatch}</Text>
            ) : null}
          </Text>
          <View className="mt-0.5">
            <MemberScoreChips
              film={film}
              subset={ctx.subset}
              membersById={ctx.membersById}
            />
          </View>
          {reason ? (
            <Text numberOfLines={2} className="text-xs leading-4 text-faint">
              {reason}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

export const FilmCard = memo(FilmCardBase);
