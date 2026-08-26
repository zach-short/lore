import { scoreOf, seenOf, starStr } from "@/lib/lore";
import { Text, View } from "@/tw";

import type { Film, Member, MemberId } from "@/lib/lore";

type MemberScoreChipsProps = {
  film: Film;
  subset: MemberId[];
  membersById: Map<MemberId, Member>;
};

/** Per-member verdicts: filled chip = has seen it (their real rating),
    outlined chip = the model's prediction for them. */
export function MemberScoreChips({
  film,
  subset,
  membersById,
}: MemberScoreChipsProps) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {subset.map((id) => {
        const member = membersById.get(id);
        if (!member) return null;
        const seen = seenOf(film, id);
        if (seen) {
          return (
            <View
              key={id}
              accessible
              accessibilityLabel={`${member.name} has seen it${seen.r != null ? `, rated ${seen.r.toFixed(1)}` : ""}`}
              className="flex-row items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5"
            >
              <Text className="text-xs font-semibold text-ink">
                {member.name[0]}
              </Text>
              <Text className="text-xs text-ink">
                {seen.r != null ? starStr(seen.r) : "✓"}
              </Text>
            </View>
          );
        }
        const predicted = scoreOf(film, id);
        if (!predicted) return null;
        return (
          <View
            key={id}
            accessible
            accessibilityLabel={`predicted ${predicted.s.toFixed(1)} for ${member.name}`}
            className="flex-row items-center gap-1 rounded-md border border-line px-1.5 py-0.5"
          >
            <Text className="text-xs font-semibold text-muted">
              {member.name[0]}
            </Text>
            <Text className="text-xs text-muted">{starStr(predicted.s)}</Text>
          </View>
        );
      })}
    </View>
  );
}
