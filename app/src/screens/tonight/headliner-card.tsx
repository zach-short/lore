import { MemberScoreChips } from "@/components/member-score-chips";
import { Poster } from "@/components/poster";
import { SectionLabel } from "@/components/section-label";
import { Stars } from "@/components/stars";
import {
  andList,
  confidenceBadge,
  metaLine,
  providerSummary,
  reasonFor,
} from "@/lib/lore";
import { STRINGS } from "@/lib/strings";
import { Link, Pressable, Text, View } from "@/tw";

import type { ScoredFilm } from "@/lib/lore";
import type { CardContext } from "./use-tonight";

type HeadlinerCardProps = {
  item: ScoredFilm;
  ctx: CardContext;
};

/* The signature move: the app's job is to produce ONE answer, so rank #1 gets
   the marquee, not a 24-up grid of equals. */
export function HeadlinerCard({ item, ctx }: HeadlinerCardProps) {
  const { film, result } = item;
  const providers = providerSummary(film.pv, ctx.region);
  const reason = reasonFor(film, result, ctx);
  const badge = confidenceBadge(film, ctx);

  return (
    <Link href={`/film/${film.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Tonight's pick: ${film.title}`}
        className="mb-4 rounded-3xl border border-line bg-surface p-4 active:bg-surface-2"
      >
        <View className="mb-3 flex-row items-center justify-between">
          <SectionLabel className="text-lamp">{STRINGS.nowShowing}</SectionLabel>
          {result.star != null ? <Stars value={result.star} size="lg" /> : null}
        </View>
        <View className="flex-row gap-4">
          <Poster path={film.poster} title={film.title} width="w342" className="w-32" />
          <View className="flex-1 gap-1.5">
            <Text className="font-display text-3xl leading-9 text-ink">
              {film.title}
            </Text>
            <Text className="text-xs text-muted">{metaLine(film)}</Text>
            <Text className="text-xs text-muted">
              {providers.label}
              {providers.isAttributed ? (
                <Text className="text-faint">  {STRINGS.justWatch}</Text>
              ) : null}
            </Text>
            <View className="mt-1">
              <MemberScoreChips
                film={film}
                subset={ctx.subset}
                membersById={ctx.membersById}
              />
            </View>
            {badge ? (
              <View className="mt-1 flex-row">
                <View
                  className={
                    badge.kind === "high"
                      ? "rounded-md border border-good px-1.5 py-0.5"
                      : "rounded-md border border-wild px-1.5 py-0.5"
                  }
                >
                  <Text
                    className={
                      badge.kind === "high"
                        ? "text-xs text-good"
                        : "text-xs text-wild"
                    }
                  >
                    {badge.kind === "high"
                      ? STRINGS.highConfidence
                      : STRINGS.wildcardFor(andList(badge.names))}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
        {reason ? (
          <Text className="mt-3 text-sm leading-5 text-ink">{reason}</Text>
        ) : null}
      </Pressable>
    </Link>
  );
}
