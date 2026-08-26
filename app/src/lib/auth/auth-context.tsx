import { createContext, useContext, useEffect, useState } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";

export type AuthState = {
  session: Session | null;
  /** true until the persisted session has been read back */
  isHydrating: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

type AuthProviderProps = { children: ReactNode };

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    session: null,
    isHydrating: isSupabaseConfigured,
  });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let isCancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isCancelled) {
          setState({ session: data.session, isHydrating: false });
        }
      })
      .catch(() => {
        if (!isCancelled) setState({ session: null, isHydrating: false });
      });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isCancelled) setState({ session, isHydrating: false });
      },
    );
    return () => {
      isCancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
