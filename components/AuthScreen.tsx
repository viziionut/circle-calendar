"use client";

import { CalendarHeart, ChevronRight, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/types/database";

export function AuthScreen() {
  const [brand, setBrand] = useState<Brand>("bros");
  const [mode, setMode] = useState<"landing" | "login" | "register">("landing");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setMessage(error?.message || "Autentificare reușită.");
    } else {
      const displayName = String(form.get("displayName") || "").trim();
      const username = String(form.get("username") || "").trim().replace(/^@/, "");
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName, username, brand } },
      });
      setMessage(error?.message || "Cont creat. Verifică emailul dacă Supabase cere confirmarea.");
    }
    setBusy(false);
  }

  if (mode === "landing") {
    return <main className={`landing ${brand}`}>
      <header className="landingHeader"><div className="logo"><CalendarHeart/><strong>Circle Calendar</strong></div><button className="textButton" onClick={() => setMode("login")}>Log in</button></header>
      <section className="hero">
        <span className="eyebrow">PRIVATE SOCIAL CALENDAR</span>
        <h1>Plan together.<br/><em>Remember forever.</em></h1>
        <p>Evenimente, grupuri și albume foto-video într-un singur loc, pe web și în viitoarea aplicație mobilă.</p>
        <div className="brandCards">
          <button className={brand === "bros" ? "selected" : ""} onClick={() => setBrand("bros")}><span className="personIcon">👨</span><strong>Bro&apos;s Calendar</strong><small>simplu și energic</small></button>
          <button className={brand === "girls" ? "selected" : ""} onClick={() => setBrand("girls")}><span className="personIcon">👩</span><strong>Girls&apos; Calendar</strong><small>social și elegant</small></button>
        </div>
        <button className="primary heroButton" onClick={() => setMode("register")}>Creează cont <ChevronRight/></button>
      </section>
    </main>;
  }

  return <main className={`authPage ${brand}`}>
    <section className="authCard">
      <button className="textButton" onClick={() => setMode("landing")}>← Înapoi</button>
      <div className="authIcon"><UserRound/></div>
      <h1>{mode === "login" ? "Bine ai revenit" : "Creează cont"}</h1>
      <p>{mode === "login" ? "Intră în cercul tău." : `Experiența aleasă: ${brand === "bros" ? "Bro's" : "Girls'"}.`}</p>
      <form onSubmit={submit} className="formStack">
        {mode === "register" && <>
          <label>Nume<input name="displayName" required placeholder="Ionuț Bogdan"/></label>
          <label>Username<input name="username" required placeholder="ionut"/></label>
        </>}
        <label>Email<input name="email" type="email" required placeholder="email@exemplu.ro"/></label>
        <label>Parolă<input name="password" type="password" minLength={6} required/></label>
        <button className="primary" disabled={busy}>{busy ? "Se încarcă…" : mode === "login" ? "Log in" : "Creează cont"}</button>
      </form>
      {message && <div className="formMessage">{message}</div>}
      <button className="switchMode" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Nu ai cont? Creează unul" : "Ai deja cont? Log in"}</button>
    </section>
  </main>;
}
