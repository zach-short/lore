import { Chip } from "@/components/chip";
import { SectionLabel } from "@/components/section-label";
import { andList } from "@/lib/movienight";
import { STRINGS } from "@/lib/strings";
import { Text, View } from "@/tw";

import type { ConfidenceNote, Member, MemberId } from "@/lib/movienight";

type MemberPickerProps = {
  members: Member[];
  subset: MemberId[];
  note: ConfidenceNote | null;
  onToggle: (id: MemberId) => void;
};

export function MemberPicker({ members, subset, note, onToggle }: MemberPickerProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <SectionLabel>{STRINGS.tonightLabel}</SectionLabel>
        <View className="flex-1 flex-row flex-wrap gap-2">
          {members.map((member) => (
            <Chip
              key={member.id}
              label={member.name}
              isOn={subset.includes(member.id)}
              hint={`${member.username} · ${member.n} ratings`}
              onPress={() => onToggle(member.id)}
            />
          ))}
        </View>
      </View>
      {note ? <ConfidenceNoteLine note={note} /> : null}
    </View>
  );
}

type ConfidenceNoteLineProps = { note: ConfidenceNote };

/* The once-at-the-top half of the wildcard story (see reasons.ts): members the
   model is thin on are described here rather than badged on every card. */
function ConfidenceNoteLine({ note }: ConfidenceNoteLineProps) {
  const parts: string[] = [];
  if (note.thin.length) {
    parts.push(
      STRINGS.confNote.thin(
        andList(note.thin.map((m) => m.name)),
        andList(note.thin.map((m) => `${m.n} ratings`)),
      ),
    );
  }
  if (note.weak.length) {
    parts.push(STRINGS.confNote.weak(andList(note.weak.map((m) => m.name))));
  }
  parts.push(STRINGS.confNote.coda);
  return <Text className="text-xs leading-4 text-faint">{parts.join(" ")}</Text>;
}
