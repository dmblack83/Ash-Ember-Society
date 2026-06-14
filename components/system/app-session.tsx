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

type SupabaseSessionLike = {
  user?:        SupabaseUser | null;
  expires_at?:  number; // unix seconds
} | null | undefined;

function toAppSession(session: SupabaseSessionLike): AppSession | null {
  const user = session?.user;
  if (!user) return null;
  /* Treat an already-expired access token as no session. On a PWA cold
     launch the stored token may be expired; rendering authed UI now would
     fire client queries that 401 (RLS) before the proxy redirects. Return
     null so the route shows its neutral state until refresh/redirect. */
  if (session?.expires_at && session.expires_at * 1000 <= Date.now()) return null;
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
      if (active) setValue({ ready: true, session: toAppSession(data.session) });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (active) setValue({ ready: true, session: toAppSession(s) });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}
