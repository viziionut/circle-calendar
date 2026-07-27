"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AuthScreen } from "@/components/AuthScreen";
import { AppShell } from "@/components/AppShell";
import { AccountActivityGuard } from "@/components/AccountActivityGuard";
import { BrandLoader } from "@/components/Brand";

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!ready) return <main className="loadingPage"><BrandLoader/></main>;
  return session ? <AccountActivityGuard session={session}><AppShell session={session}/></AccountActivityGuard> : <AuthScreen/>;
}
