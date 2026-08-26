/* Route params arrive as string | string[] | undefined, and the native router
   can hand over the literal strings "undefined"/"null". Identity params (the
   resource IS the field) reject to a not-found state instead of degrading. */

export function firstOf(
  value: string | string[] | undefined,
): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined || first === "undefined" || first === "null") {
    return undefined;
  }
  return first;
}

export function parseIdParam(
  value: string | string[] | undefined,
): number | null {
  const raw = firstOf(value)?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}
