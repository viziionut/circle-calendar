"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const UPDATE_INTERVAL = 12 * 60 * 1000;

export function AccountActivityGuard({ session, children }: { session: Session; children: ReactNode }) {
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkAndTouch() {
      const { data, error } = await supabase.from("profiles")
        .select("account_status,suspended_reason,last_seen_at")
        .eq("id", session.user.id)
        .single();
      if (cancelled) return;
      if (!error && data?.account_status === "suspended") {
        setBlockedReason(data.suspended_reason || "Contul tău este suspendat.");
        await supabase.auth.signOut();
        setReady(true);
        return;
      }
      if (!error) {
        const lastSeen = data?.last_seen_at ? new Date(data.last_seen_at).getTime() : 0;
        if (Date.now() - lastSeen >= UPDATE_INTERVAL) {
          await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", session.user.id);
        }
      }
      setReady(true);
    }
    void checkAndTouch();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkAndTouch();
    }, UPDATE_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session.user.id]);

  if (!ready) return <main className="loadingPage">Se verifică accesul…</main>;
  if (blockedReason) return <main className="accountSuspended"><h1>Cont suspendat</h1><p>{blockedReason}</p><span>Contactează administratorul aplicației pentru detalii.</span></main>;
  return <>{children}</>;
}
