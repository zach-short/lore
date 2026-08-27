import { useColorScheme } from "react-native";

import logoMark from "@/assets/images/logo-mark.png";
import { paletteFor } from "@/theme";
import { Image } from "@/tw/image";

import type { Palette } from "@/theme";

/* react-native-svg isn't a dependency, so the quote-mark glyph ships as a
   white-on-transparent alpha mask rasterised from assets/images/logo.svg.
   expo-image's tintColor paints the mask in a palette token (an feFlood/
   feComposite filter on web, template rendering on native), which keeps one
   asset honest in both color schemes instead of baking in a hex. */

type LogoMarkTone = Extract<keyof Palette, "lamp" | "ink" | "faint">;

type LogoMarkProps = {
  tone?: LogoMarkTone;
  className?: string;
};

/** Lore's brand mark. Decorative by design — every placement sits beside the
    wordmark or a title that already names the app, so it stays out of the
    accessibility tree rather than repeating that name. */
export function LogoMark({ tone = "lamp", className }: LogoMarkProps) {
  const palette = paletteFor(useColorScheme());

  return (
    <Image
      source={logoMark}
      tintColor={palette[tone]}
      alt=""
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      accessibilityIgnoresInvertColors
      className={`object-contain ${className ?? "h-8 w-8"}`}
    />
  );
}
