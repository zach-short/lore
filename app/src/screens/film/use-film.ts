import { useMemo } from "react";

import { useMovienightData } from "@/lib/data";
import {
  DEFAULT_CONF,
  DEFAULT_FEAT,
  membersById,
  starsFor,
} from "@/lib/movienight";
import { effectiveSubset, useSession } from "@/lib/session/session-context";

import type { Film, Member, MemberId } from "@/lib/movienight";

export type FilmDetail = {
  film: Film;
  subset: MemberId[];
  subsetMembers: Member[];
  membersById: Map<MemberId, Member>;
  groupStar: number | null;
  conf: (typeof DEFAULT_CONF);
  feat: (typeof DEFAULT_FEAT);
  region: string | undefined;
};

export function useFilm(filmId: number | null) {
  const query = useMovienightData();
  const { state } = useSession();
  const data = query.data;

  const detail: FilmDetail | null = useMemo(() => {
    if (!data || filmId == null) return null;
    const film = data.films.find((f) => f.id === filmId);
    if (!film) return null;
    const subset = effectiveSubset(state.subset, data.members);
    const byId = membersById(data.members);
    return {
      film,
      subset,
      subsetMembers: subset
        .map((id) => byId.get(id))
        .filter((m): m is Member => Boolean(m)),
      membersById: byId,
      groupStar: starsFor(subset, film),
      conf: data.conf ?? DEFAULT_CONF,
      feat: data.feat ?? DEFAULT_FEAT,
      region: data.region,
    };
  }, [data, filmId, state.subset]);

  return { query, detail };
}
