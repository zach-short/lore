import { featLabel, scoreOf, seenOf, starStr } from "@/lib/movienight";
import { Text, View } from "@/tw";

import type { ConfBands, Film, Member } from "@/lib/movienight";

type BallotRowProps = {
  member: Member;
  film: Film;
  conf: ConfBands;
};

/** One member's line on the ballot: their real rating if they've seen it,
    otherwise the model's prediction with its confidence and its reasons. */
export function BallotRow({ member, film, conf }: BallotRowProps) {
  const seen = seenOf(film, member.id);
  const score = scoreOf(film, member.id);

  return (
    <View className="gap-1 rounded-2xl border border-line bg-surface p-3">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-base font-semibold text-ink">{member.name}</Text>
        {seen ? (
          <Text className="font-display text-xl text-lamp">
            {seen.r != null ? starStr(seen.r) : "seen ✓"}
          </Text>
        ) : score ? (
          <Text className="font-display text-xl text-muted">
            {starStr(score.s)}
          </Text>
        ) : null}
      </View>
      {seen ? <SeenLine member={member} film={film} /> : null}
      {!seen && score ? (
        <PredictionLines
          member={member}
          conf={conf}
          score={score}
        />
      ) : null}
    </View>
  );
}

type SeenLineProps = { member: Member; film: Film };

function SeenLine({ member, film }: SeenLineProps) {
  const seen = seenOf(film, member.id);
  if (!seen) return null;
  const bits: string[] = [];
  if (seen.d) bits.push(`watched ${seen.d}`);
  if (seen.rw) bits.push(`${seen.rw} rewatch${seen.rw > 1 ? "es" : ""}`);
  if (seen.l) bits.push("liked ♥");
  if (seen.wl) bits.push("watchlisted");
  return bits.length ? (
    <Text className="text-xs text-muted">{bits.join(" · ")}</Text>
  ) : null;
}

type PredictionLinesProps = {
  member: Member;
  conf: ConfBands;
  score: NonNullable<ReturnType<typeof scoreOf>>;
};

function PredictionLines({ member, conf, score }: PredictionLinesProps) {
  const confidenceLabel = member.lowconf
    ? "wildcard (thin model)"
    : score.c < conf.lo
      ? "wildcard"
      : score.c >= conf.hi
        ? "high confidence"
        : "medium confidence";
  const confidenceTone =
    member.lowconf || score.c < conf.lo
      ? "text-wild"
      : score.c >= conf.hi
        ? "text-good"
        : "text-muted";

  const contributions = (score.x?.c ?? [])
    .filter(([, value]) => value !== 0)
    .slice(0, 3);

  return (
    <View className="gap-1">
      <Text className={`text-xs ${confidenceTone}`}>
        predicted · {confidenceLabel}
      </Text>
      {contributions.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {contributions.map(([feature, value]) => (
            <View
              key={feature}
              className="rounded-md border border-line px-1.5 py-0.5"
            >
              <Text
                className={value > 0 ? "text-xs text-good" : "text-xs text-bad"}
              >
                {value > 0 ? "+" : "−"} {featLabel(feature)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {(score.x?.w ?? 1) < 0.5 ? (
        <Text className="text-xs text-faint">
          mostly the group prior — the model leans {Math.round((1 - (score.x?.w ?? 0)) * 100)}% on
          acclaim + group taste here
        </Text>
      ) : null}
    </View>
  );
}
