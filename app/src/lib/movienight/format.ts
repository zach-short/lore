import type { Providers } from "./types";

const LANGS: Record<string, string> = {
  en: "English", fr: "French", es: "Spanish", de: "German", it: "Italian",
  ja: "Japanese", ko: "Korean", zh: "Chinese", cn: "Chinese", hi: "Hindi",
  pt: "Portuguese", ru: "Russian", sv: "Swedish", da: "Danish",
  no: "Norwegian", fi: "Finnish", pl: "Polish", tr: "Turkish", fa: "Persian",
  th: "Thai", ar: "Arabic", el: "Greek", he: "Hebrew", hu: "Hungarian",
  cs: "Czech", nl: "Dutch", ro: "Romanian", id: "Indonesian", tl: "Filipino",
};

export function langName(code: string | null | undefined): string {
  if (!code) return "?";
  return LANGS[code] ?? code.toUpperCase();
}

/** Strip ad-tier and channel-reseller suffixes so one service reads as one chip. */
export function canonProvider(name: string): string {
  return name
    .replace(/\s+(standard\s+)?with\s+ads$/i, "")
    .replace(/\s+(amazon|apple\s*tv|roku\s*premium)\s*channel$/i, "")
    .trim();
}

/** Human label for a model feature key like `g:Drama`, `kw:heist`, `d:Nolan`. */
export function featLabel(feature: string): string {
  const i = feature.indexOf(":");
  const kind = feature.slice(0, i);
  const name = feature.slice(i + 1);
  if (kind === "kw") return `“${name}”`;
  if (kind === "d") return `dir. ${name}`;
  if (kind === "l") return `${langName(name)}-language`;
  if (kind === "rt") return `${name} min`;
  return name; // genres, cast, decades read fine as-is
}

export function starStr(value: number): string {
  return `★${value.toFixed(1)}`;
}

export function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

export function shortYear(year: number | null): string {
  return year == null ? "" : `’${String(year).slice(2)}`;
}

export type ProviderSummary = {
  label: string;
  /** true when JustWatch data backs the label (attribution required) */
  isAttributed: boolean;
};

export function providerSummary(
  pv: Providers,
  region: string | undefined,
): ProviderSummary {
  const flat = [...new Set((pv.f ?? []).map(canonProvider))];
  if (flat.length) {
    return { label: flat.slice(0, 3).join(" · "), isAttributed: true };
  }
  if ((pv.r ?? []).length) return { label: "rent only", isAttributed: true };
  return {
    label: `not streaming ${region ?? ""}`.trim(),
    isAttributed: false,
  };
}

export function metaLine(film: {
  rt: number | null;
  genres: string[];
  lang: string | null;
  year: number | null;
}): string {
  const parts: string[] = [];
  if (film.rt) parts.push(`${film.rt} min`);
  parts.push(...film.genres.slice(0, 2));
  if (film.lang && film.lang !== "en") parts.push(langName(film.lang));
  if (film.year) parts.push(shortYear(film.year));
  return parts.join(" · ");
}
