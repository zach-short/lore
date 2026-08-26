import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import { DEFAULT_FILTERS } from "@/lib/lore";

import type {
  Aggregation,
  Filters,
  Member,
  MemberId,
  Mode,
} from "@/lib/lore";
import type { ReactNode } from "react";

const STORAGE_KEY = "lore-app-v1";

export type SessionState = {
  /** null = everyone (the default before anyone fiddles with chips) */
  subset: MemberId[] | null;
  mode: Mode;
  agg: Aggregation;
  filters: Filters;
  isHydrated: boolean;
};

const initialState: SessionState = {
  subset: null,
  mode: "blind",
  agg: "avg_nomisery",
  filters: DEFAULT_FILTERS,
  isHydrated: false,
};

type SessionAction =
  | { type: "hydrate"; saved: Partial<SessionState> | null }
  | { type: "toggle-member"; id: MemberId; allIds: MemberId[] }
  | { type: "set-mode"; mode: Mode }
  | { type: "set-agg"; agg: Aggregation }
  | { type: "patch-filters"; patch: Partial<Filters> }
  | { type: "reset-filters" };

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "hydrate": {
      if (!action.saved) return { ...state, isHydrated: true };
      const { subset, mode, agg, filters } = action.saved;
      return {
        subset: subset ?? null,
        mode: mode ?? state.mode,
        agg: agg ?? state.agg,
        filters: { ...DEFAULT_FILTERS, ...filters },
        isHydrated: true,
      };
    }
    case "toggle-member": {
      const current = state.subset ?? action.allIds;
      const next = current.includes(action.id)
        ? current.filter((id) => id !== action.id)
        : [...current, action.id];
      return { ...state, subset: next };
    }
    case "set-mode":
      return { ...state, mode: action.mode };
    case "set-agg":
      return { ...state, agg: action.agg };
    case "patch-filters":
      return { ...state, filters: { ...state.filters, ...action.patch } };
    case "reset-filters":
      return { ...state, filters: DEFAULT_FILTERS };
  }
}

type SessionContextValue = {
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

type SessionProviderProps = { children: ReactNode };

export function SessionProvider({ children }: SessionProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isCancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (isCancelled) return;
        const saved = raw ? (JSON.parse(raw) as Partial<SessionState>) : null;
        dispatch({ type: "hydrate", saved });
      })
      .catch(() => dispatch({ type: "hydrate", saved: null }));
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.isHydrated) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    const { subset, mode, agg, filters } = state;
    persistTimer.current = setTimeout(() => {
      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ subset, mode, agg, filters }),
      ).catch(() => {
        // Losing a persisted toggle is harmless; never crash over it.
      });
    }, 300);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return value;
}

/** Effective subset against the live member list; stale saved ids fall back to
    everyone, but a deliberately emptied selection stays empty. */
export function effectiveSubset(
  subset: MemberId[] | null,
  members: Member[],
): MemberId[] {
  const allIds = members.map((m) => m.id);
  if (subset === null) return allIds;
  const known = subset.filter((id) => allIds.includes(id));
  if (!known.length && subset.length) return allIds;
  return known;
}
