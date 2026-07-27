"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ro from "@/locales/ro.json";
import en from "@/locales/en.json";

export const SUPPORTED_LOCALES = ["ro", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
type Variables = Record<string, string | number>;
type Dictionary = Record<string, unknown>;

const dictionaries: Record<AppLocale, Dictionary> = { ro, en };
const localeTags: Record<AppLocale, string> = { ro: "ro-RO", en: "en-GB" };

function getValue(dictionary: Dictionary, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, variables: Variables = {}) {
  return template
    .replace(/\{(\w+), plural, one \{([^{}]*)\} other \{([^{}]*)\}\}/g, (_, name, one, other) =>
      Number(variables[name]) === 1 ? one : other)
    .replace(/\{(\w+)\}/g, (_, name) => String(variables[name] ?? ""));
}

type I18nValue = {
  locale: AppLocale;
  localeTag: string;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, variables?: Variables) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatRelative: (value: string | Date) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<AppLocale>("ro");

  useEffect(() => {
    const saved = window.localStorage.getItem("circle-calendar-locale");
    if (SUPPORTED_LOCALES.includes(saved as AppLocale)) updateLocale(saved as AppLocale);
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    updateLocale(next);
    window.localStorage.setItem("circle-calendar-locale", next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback((key: string, variables?: Variables) => {
    const template = getValue(dictionaries[locale], key) ?? getValue(dictionaries.ro, key) ?? key;
    return interpolate(template, variables);
  }, [locale]);

  const formatDate = useCallback((value: string | Date, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) => {
    const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return new Intl.DateTimeFormat(localeTags[locale], options).format(date);
  }, [locale]);

  const formatTime = useCallback((value: string | Date, options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }) =>
    new Intl.DateTimeFormat(localeTags[locale], options).format(new Date(value)), [locale]);

  const formatRelative = useCallback((value: string | Date) => {
    const difference = new Date(value).getTime() - Date.now();
    const absolute = Math.abs(difference);
    const formatter = new Intl.RelativeTimeFormat(localeTags[locale], { numeric: "auto" });
    if (absolute < 60_000) return formatter.format(0, "second");
    if (absolute < 3_600_000) return formatter.format(Math.round(difference / 60_000), "minute");
    if (absolute < 86_400_000) return formatter.format(Math.round(difference / 3_600_000), "hour");
    return formatter.format(Math.round(difference / 86_400_000), "day");
  }, [locale]);

  const value = useMemo(() => ({
    locale, localeTag: localeTags[locale], setLocale, t, formatDate, formatTime, formatRelative,
  }), [formatDate, formatRelative, formatTime, locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
