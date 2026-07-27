"use client";

import { ChevronRight } from "lucide-react";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/types/database";
import { BrandLogo, BrandMark } from "./Brand";
import { useI18n } from "@/lib/i18n";

export function AuthScreen() {
  const { locale, setLocale, t } = useI18n();
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
      setMessage(error?.message || t("auth.signedIn"));
    } else {
      const displayName = String(form.get("displayName") || "").trim();
      const username = String(form.get("username") || "").trim().replace(/^@/, "");
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName, username, brand, locale } },
      });
      setMessage(error?.message || t("auth.registered"));
    }
    setBusy(false);
  }

  if (mode === "landing") {
    return <main className={`landing ${brand}`}>
      <header className="landingHeader"><div className="logo"><BrandLogo/></div><div className="authHeaderActions"><button className="textButton" onClick={() => setLocale(locale === "ro" ? "en" : "ro")}>{locale === "ro" ? "EN" : "RO"}</button><button className="textButton" onClick={() => setMode("login")}>{t("auth.login")}</button></div></header>
      <section className="hero">
        <span className="eyebrow">PRIVATE SOCIAL CALENDAR</span>
        <h1>Plan together.<br/><em>Remember forever.</em></h1>
        <p>{t("auth.hero")}</p>
        <div className="brandCards">
          <button className={brand === "bros" ? "selected" : ""} onClick={() => setBrand("bros")}><span className="personIcon">👨</span><strong>Bro&apos;s Calendar</strong><small>simplu și energic</small></button>
          <button className={brand === "girls" ? "selected" : ""} onClick={() => setBrand("girls")}><span className="personIcon">👩</span><strong>Girls&apos; Calendar</strong><small>social și elegant</small></button>
        </div>
        <button className="primary heroButton" onClick={() => setMode("register")}>{t("auth.createAccount")} <ChevronRight/></button>
      </section>
    </main>;
  }

  return <main className={`authPage ${brand}`}>
    <section className="authCard">
      <button className="textButton" onClick={() => setMode("landing")}>← {t("auth.back")}</button>
      <div className="authBrand"><BrandMark/><span>Plan. Share. Remember.</span></div>
      <h1>{mode === "login" ? t("auth.welcomeBack") : t("auth.createAccount")}</h1>
      <p>{mode === "login" ? t("auth.enterCircle") : `${brand === "bros" ? "Bro's" : "Girls'"}`}</p>
      <form onSubmit={submit} className="formStack">
        {mode === "register" && <>
          <label>{t("auth.name")}<input name="displayName" required placeholder="Ionuț Bogdan"/></label>
          <label>Username<input name="username" required placeholder="ionut"/></label>
        </>}
        <label>Email<input name="email" type="email" required placeholder="email@exemplu.ro"/></label>
        <label>{t("auth.password")}<input name="password" type="password" minLength={6} required/></label>
        <button className="primary" disabled={busy}>{busy ? t("auth.busy") : mode === "login" ? t("auth.login") : t("auth.createAccount")}</button>
      </form>
      {message && <div className="formMessage">{message}</div>}
      <button className="switchMode" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}</button>
    </section>
  </main>;
}
