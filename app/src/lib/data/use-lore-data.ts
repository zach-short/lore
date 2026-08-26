import { useQuery } from "@tanstack/react-query";

import { loadLoreData } from "./load-data";
import { queryKeys } from "./query-keys";

/** The whole payload in one read; scoring is precomputed, the app aggregates. */
export function useLoreData() {
  return useQuery({
    queryKey: queryKeys.lore.data,
    queryFn: loadLoreData,
    staleTime: 5 * 60_000,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}
