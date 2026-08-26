import { useMemo } from "react";

import { useLoreData } from "@/lib/data";
import { useCrewMembers } from "@/lib/friends";
import {
  computeResults,
  confidenceNote,
  countActiveFilters,
  DEFAULT_CONF,
  DEFAULT_FEAT,
  membersById,
} from "@/lib/lore";
import { effectiveSubset, useSession } from "@/lib/session/session-context";

import type {
  ConfBands,
  FeatBands,
  Member,
  MemberId,
  Mode,
  ScoredFilm,
} from "@/lib/lore";

export type CardContext = {
  subset: MemberId[];
  membersById: Map<MemberId, Member>;
  conf: ConfBands;
  feat: FeatBands;
  region: string | undefined;
};

/** Everything the Tonight screen renders, derived in one place. */
export function useTonight() {
  const query = useLoreData();
  const { state, dispatch } = useSession();
  const data = query.data;

  const payloadMembers = useMemo(() => data?.members ?? [], [data]);
  /* Tonight's pickable crew is you + your accepted friends — the member
     picker IS choosing who's part of the movie night. */
  const crew = useCrewMembers(payloadMembers);
  const members = crew.members;
  const subset = useMemo(
    () => effectiveSubset(state.subset, members),
    [state.subset, members],
  );
  const byId = useMemo(() => membersById(members), [members]);

  const results: ScoredFilm[] = useMemo(() => {
    if (!data) return [];
    return computeResults(data, {
      subset,
      mode: state.mode,
      agg: state.agg,
      filters: state.filters,
    });
  }, [data, subset, state.mode, state.agg, state.filters]);

  const cardContext: CardContext = useMemo(
    () => ({
      subset,
      membersById: byId,
      conf: data?.conf ?? DEFAULT_CONF,
      feat: data?.feat ?? DEFAULT_FEAT,
      region: data?.region,
    }),
    [subset, byId, data],
  );

  const note = useMemo(() => confidenceNote(subset, byId), [subset, byId]);

  const handleToggleMember = (id: MemberId) =>
    dispatch({
      type: "toggle-member",
      id,
      allIds: members.map((m) => m.id),
    });
  const handleSetMode = (mode: Mode) => dispatch({ type: "set-mode", mode });

  return {
    query,
    isLoading: query.isPending || crew.isPending,
    hasPayloadMembers: payloadMembers.length > 0,
    data,
    members,
    subset,
    results,
    cardContext,
    note,
    mode: state.mode,
    agg: state.agg,
    filters: state.filters,
    activeFilterCount: countActiveFilters(state.filters),
    handleToggleMember,
    handleSetMode,
  };
}
