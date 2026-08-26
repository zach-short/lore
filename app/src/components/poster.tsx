import { useColorScheme } from "react-native";

import { TMDB_POSTER_BASE } from "@/lib/movienight";
import { paletteFor } from "@/theme";
import { Text, View } from "@/tw";
import { Image } from "@/tw/image";

type PosterProps = {
  path: string | null;
  title: string;
  width: "w185" | "w342" | "w500";
  className?: string;
};

/** TMDB poster with a titled placeholder when a film has no artwork. */
export function Poster({ path, title, width, className }: PosterProps) {
  const scheme = useColorScheme();
  const palette = paletteFor(scheme);
  const frame = `aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 ${className ?? ""}`;

  if (!path) {
    return (
      <View className={`${frame} items-center justify-center p-2`}>
        <Text
          numberOfLines={4}
          className="text-center font-display text-base text-faint"
        >
          {title}
        </Text>
      </View>
    );
  }
  return (
    <View className={frame}>
      <Image
        source={{ uri: `${TMDB_POSTER_BASE}${width}${path}` }}
        accessibilityIgnoresInvertColors
        className="h-full w-full object-cover"
        transition={150}
        placeholder={{ blurhash: undefined }}
        style={{ backgroundColor: palette.surface2 }}
      />
    </View>
  );
}
