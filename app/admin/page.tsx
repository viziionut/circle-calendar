"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { adminFetch } from "@/lib/admin/client";
import { supabase } from "@/lib/supabase";

type AdminIdentity = { user: { id: string; email: string | null }; role: "owner" | "admin" };

export default function AdminPage() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    adminFetch<AdminIdentity>("/api/admin/me").then(data => {
      setIdentity(data);
      setState("allowed");
    }).catch(error => {
      setMessage(error instanceof Error ? error.message : "Acces interzis.");
      setState("denied");
    });
  }, []);

  if (state === "loading") return <main className="adminGate">Se verifică accesul administrativ…</main>;
  if (state === "denied") return <main className="adminDenied"><ShieldAlert/><h1>Acces interzis</h1><p>{message}</p><a href="/"><ArrowLeft/> Înapoi în aplicație</a></main>;
  return identity ? <AdminPanel identity={identity}/> : null;
}
