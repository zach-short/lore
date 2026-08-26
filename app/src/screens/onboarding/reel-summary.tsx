import { SectionLabel } from "@/components/section-label";
import { STRINGS } from "@/lib/strings";
import { Text, View } from "@/tw";

import type { ExportSummary } from "@/lib/letterboxd";

type ReelSummaryProps = {
  summary: ExportSummary;
};

/** What the parse found, before it leaves the device. */
export function ReelSummary({ summary }: ReelSummaryProps) {
  const rated = summary.ratingHistogram.reduce((a, b) => a + b, 0);
  const lines = [
    STRINGS.onboarding.filmsCount(summary.films),
    summary.meanRating !== null
      ? STRINGS.onboarding.ratedCount(rated, summary.meanRating.toFixed(2))
      : null,
    summary.counts.watchlist
      ? STRINGS.onboarding.watchlistCount(summary.counts.watchlist)
      : null,
    summary.counts.likes
      ? STRINGS.onboarding.likesCount(summary.counts.likes)
      : null,
    summary.firstActivity && summary.lastActivity
      ? STRINGS.onboarding.activitySpan(
          summary.firstActivity,
          summary.lastActivity,
        )
      : null,
  ].filter((line): line is string => line !== null);

  return (
    <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
      <SectionLabel>{STRINGS.onboarding.summaryTitle}</SectionLabel>
      {lines.map((line) => (
        <Text key={line} className="text-sm leading-5 text-ink">
          {line}
        </Text>
      ))}
      {rated > 0 ? <RatingHistogram histogram={summary.ratingHistogram} /> : null}
    </View>
  );
}

type RatingHistogramProps = {
  histogram: number[];
};

function RatingHistogram({ histogram }: RatingHistogramProps) {
  const max = Math.max(...histogram, 1);
  return (
    <View className="gap-1 pt-1">
      <View className="h-14 flex-row items-end gap-1">
        {histogram.map((count, i) => (
          <View
            key={i}
            className={`flex-1 rounded-t ${count ? "bg-lamp" : "bg-surface-2"}`}
            style={{ height: count ? `${Math.max((count / max) * 100, 6)}%` : 2 }}
          />
        ))}
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-faint">½★</Text>
        <Text className="text-xs text-faint">5★</Text>
      </View>
    </View>
  );
}
