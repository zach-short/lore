import { useState } from "react";

import { supabase } from "@/lib/supabase";
import { STRINGS } from "@/lib/strings";

export type LoginMode = "sign-in" | "sign-up";

/* Successful sign-in surfaces nowhere here: onAuthStateChange flips the root
   layout's route guards and the router leaves this screen on its own. */
export function useLogin() {
  const [mode, setMode] = useState<LoginMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleToggleMode = () => {
    setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError(STRINGS.login.missingFields);
      return;
    }
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign-in") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (authError) setError(authError.message);
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (authError) {
          setError(authError.message);
        } else if (!data.session) {
          /* email confirmation is on for this project */
          setNotice(STRINGS.login.confirmSent);
          setMode("sign-in");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went sideways.");
    } finally {
      setIsBusy(false);
    }
  };

  return {
    mode,
    email,
    setEmail,
    password,
    setPassword,
    error,
    notice,
    isBusy,
    handleSubmit,
    handleToggleMode,
  };
}
