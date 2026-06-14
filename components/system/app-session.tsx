"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export interface AppSession {
  userId:              string;
  email:               string | null;
  onboardingCompleted: boolean;
}

interface AppSessionValue {
  /** true once the initial getSession() has resolved */
  ready:   boolean;
  /** the authenticated session, or null if signed out */
  session: AppSession | null;
}

const AppSessionContext = createContext<AppSessionValue>({ ready: false, session: null });

export function useAppSession(): AppSessionValue {
  return useContext(AppSessionContext);
}

type SupabaseUser = {
  id:             string;
  email?:         string;
  user_metadata?: Record<string, unknown>;
};

function toAppSession(user: SupabaseUser | null | undefined): AppSession | null {
  if (!user) return null;
  return {
    userId:              user.id,
    email:               user.email ?? null,
    onboardingCompleted: Boolean(user.user_metadata?.onboarding_completed),
  };
}

/**
 * Non-blocking session context for the authed zone. Resolves the
 * Supabase session client-side (getSession reads local storage, no
 * network) and keeps it current via onAuthStateChange. It does NOT
 * redirect — the proxy still guards server-rendered routes; per-route
 * client guards (e.g. HumidorRoute) apply resolveSessionGate where a
 * route is served as a static shell.
 */
export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<AppSessionValue>({ ready: false, session: null });

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setValue({ ready: true, session: toAppSession(data.session?.user) });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (active) setValue({ ready: true, session: toAppSession(s?.user) });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}
