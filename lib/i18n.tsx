"use client";

import { createContext, useContext } from "react";

type DeepRecord = Record<string, unknown>;

export interface LocaleContextValue {
  locale: string;
  messages: DeepRecord;
  switchLocale: (next: string) => void;
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: "es",
  messages: {},
  switchLocale: () => {},
});

export function useLocale(): string {
  return useContext(LocaleContext).locale;
}

export function useLocaleSwitch(): {
  locale: string;
  switchLocale: (next: string) => void;
} {
  const { locale, switchLocale } = useContext(LocaleContext);
  return { locale, switchLocale };
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce((o, k) => (o as DeepRecord)?.[k], obj);
}

export function useT(namespace: string) {
  const { messages } = useContext(LocaleContext);
  const ns = getByPath(messages, namespace);

  function t(key: string, params?: Record<string, string | number>): string {
    const val = getByPath(ns, key);
    if (typeof val !== "string") return key;
    if (!params) return val;
    return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
  }

  t.raw = (key: string): unknown => getByPath(ns, key);

  return t;
}
