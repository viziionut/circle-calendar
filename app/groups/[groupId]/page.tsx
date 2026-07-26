"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { AuthScreen } from "@/components/AuthScreen";
import { GroupHub } from "@/components/groups/GroupHub";
import { supabase } from "@/lib/supabase";

export default function GroupHubPage() {
  const params = useParams<{ groupId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!ready) return <main className="loadingPage">Se încarcă Group Hub…</main>;
  if (!session) return <AuthScreen/>;
  return <GroupHub groupId={params.groupId} currentUserId={session.user.id}/>;
}
