import { starStr, THIN_HISTORY } from "@/lib/lore";
import { Link, Text, View } from "@/tw";

import type { Member } from "@/lib/lore";

type MemberCardProps = {
  member: Member;
};

export function MemberCard({ member }: MemberCardProps) {
  const trustPct = Math.round(member.w * 100);
  return (
    <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-display text-2xl text-ink">{member.name}</Text>
        <Link
          href={`https://letterboxd.com/${member.username}/`}
          className="text-xs text-lamp"
        >
          @{member.username}
        </Link>
      </View>
      <Text className="text-xs text-muted">
        {member.n.toLocaleString()} ratings · averages {starStr(member.mu)} · a
        “great” for them starts at {starStr(member.p75)}
      </Text>
      <View className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-faint">
            how much the model trusts their own taste signal
          </Text>
          <Text className="text-xs font-semibold text-muted">{trustPct}%</Text>
        </View>
        <View
          accessible
          accessibilityValue={{ now: trustPct, min: 0, max: 100 }}
          accessibilityLabel={`model weight ${trustPct} percent`}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <View
            className="h-full rounded-full bg-lamp"
            style={{ width: `${Math.min(trustPct, 100)}%` }}
          />
        </View>
        {member.lowconf ? (
          <Text className="text-xs text-wild">
            {member.n < THIN_HISTORY
              ? "still learning their taste — every pick is a wildcard for them"
              : "their ratings don’t track genre/keyword patterns closely — predictions stay wildcards"}
          </Text>
        ) : null}
      </View>
      {member.top?.length ? (
        <View className="flex-row flex-wrap gap-1.5 pt-1">
          {member.top.map((feature) => (
            <View key={feature} className="rounded-md bg-surface-2 px-2 py-0.5">
              <Text className="text-xs text-muted">{feature}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
