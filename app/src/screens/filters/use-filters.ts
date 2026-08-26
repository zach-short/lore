import { useMemo } from "react";

import { useMovienightData } from "@/lib/data";
import { buildCatalogs } from "@/lib/movienight";
import { useSession } from "@/lib/session/session-context";

import type { Aggregation, Filters } from "@/lib/movienight";

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

export function useFilters() {
  const query = useMovienightData();
  const { state, dispatch } = useSession();

  const catalogs = useMemo(
    () => buildCatalogs(query.data?.films ?? []),
    [query.data],
  );

  const patch = (change: Partial<Filters>) =>
    dispatch({ type: "patch-filters", patch: change });

  return {
    filters: state.filters,
    agg: state.agg,
    catalogs,
    handleToggleService: (name: string) =>
      patch({ sv: toggleIn(state.filters.sv, name) }),
    handleToggleDecade: (decade: number) =>
      patch({ decades: toggleIn(state.filters.decades, decade) }),
    handleToggleLang: (lang: string) =>
      patch({ langs: toggleIn(state.filters.langs, lang) }),
    handleToggleGenre: (genre: string) =>
      patch({ xg: toggleIn(state.filters.xg, genre) }),
    handleToggleRent: () => patch({ rent: !state.filters.rent }),
    handleToggleShorts: () => patch({ shorts: !state.filters.shorts }),
    handleToggleStrict: () => patch({ strict: !state.filters.strict }),
    handleSetRuntime: (rtmax: number) => patch({ rtmax }),
    handleSetAgg: (agg: Aggregation) => dispatch({ type: "set-agg", agg }),
    handleReset: () => dispatch({ type: "reset-filters" }),
  };
}
