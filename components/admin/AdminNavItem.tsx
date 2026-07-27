"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function AdminNavItem({ onNavigate }: { onNavigate?: () => void }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    supabase.rpc("is_app_admin").then(({ data, error }) => {
      if (!error) setAllowed(Boolean(data));
    });
  }, []);

  if (!allowed) return null;
  return <button onClick={() => { onNavigate?.(); window.location.assign("/admin"); }}><ShieldCheck/>Administrare</button>;
}
