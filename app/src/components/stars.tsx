
import { starStr } from "@/lib/movienight";
import { Text } from "@/tw";

type StarsProps = {
  value: number;
  size?: "sm" | "lg";
  tone?: "lamp" | "muted";
};

export function Stars({ value, size = "sm", tone = "lamp" }: StarsProps) {
  const sizeClass = size === "lg" ? "text-2xl" : "text-sm";
  const toneClass = tone === "lamp" ? "text-lamp" : "text-muted";
  return (
    <Text className={`font-display tracking-wide ${sizeClass} ${toneClass}`}>
      {starStr(value)}
    </Text>
  );
}
