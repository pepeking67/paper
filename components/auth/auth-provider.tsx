"use client";

import type { AuthError, Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/browser";

type AuthResult = { error: AuthError | null; needsEmailConfirmation?: boolean };
type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) { setLoading(false); return; }
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured,
    loading,
    session,
    user: session?.user ?? null,
    async signIn(email, password) {
      const client = getBrowserSupabase();
      if (!client) return { error: configurationError() };
      const { error } = await client.auth.signInWithPassword({ email, password });
      return { error };
    },
    async signUp(email, password) {
      const client = getBrowserSupabase();
      if (!client) return { error: configurationError() };
      const { data, error } = await client.auth.signUp({ email, password });
      return { error, needsEmailConfirmation: !error && !data.session };
    },
    async signOut() {
      const client = getBrowserSupabase();
      if (!client) return { error: configurationError() };
      const { error } = await client.auth.signOut();
      return { error };
    },
  }), [configured, loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

function configurationError() {
  return new Error("Supabase 환경 변수가 설정되지 않았습니다.") as AuthError;
}
