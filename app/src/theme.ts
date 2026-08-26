/* JS-side render of the design tokens for consumers that cannot read CSS
   variables (NativeTabs colors, the navigation theme, expo-image placeholders).
   The single source of truth is src/global.css — names and values must match
   it; change both together. */

export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  ink: string;
  muted: string;
  faint: string;
  lamp: string;
  lampDeep: string;
  onLamp: string;
  wild: string;
  good: string;
  bad: string;
};

export const palettes: { light: Palette; dark: Palette } = {
  light: {
    bg: "#f7f2e9",
    surface: "#fffdf8",
    surface2: "#efe7d8",
    line: "#ddd2be",
    ink: "#2b231a",
    muted: "#776853",
    faint: "#a59882",
    lamp: "#a06712",
    lampDeep: "#7c4f0a",
    onLamp: "#fffdf8",
    wild: "#6a5baa",
    good: "#4f7f42",
    bad: "#a84b39",
  },
  dark: {
    bg: "#16120d",
    surface: "#201a13",
    surface2: "#2a2219",
    line: "#382e22",
    ink: "#f2ead9",
    muted: "#a3947d",
    faint: "#6e6250",
    lamp: "#e5a83c",
    lampDeep: "#b77f22",
    onLamp: "#16120d",
    wild: "#a89bd4",
    good: "#8fbf7f",
    bad: "#c9705f",
  },
};

/* RN 0.86 reports "unspecified" alongside light/dark; the dark palette is the
   design's primary, so anything that isn't an explicit "light" resolves dark. */
export function paletteFor(scheme: string | null | undefined): Palette {
  return scheme === "light" ? palettes.light : palettes.dark;
}
