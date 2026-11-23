import { useSyncExternalStore } from "react";
import { en, type Catalog } from "./en";
import { hi } from "./hi";

export type LanguageCode = "en" | "hi";
export type LanguageSetting = "system" | LanguageCode;
export type Params = Record<string, string | number>;

type PluralBase<K> = K extends `${infer Base}.other` ? Base : never;
export type TranslationKey = keyof Catalog;
export type TKey = TranslationKey | PluralBase<TranslationKey>;

export const LANGUAGES: readonly { code: LanguageCode; name: string; nativeName: string }[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
];

const CATALOGS: Record<LanguageCode, Partial<Record<string, string>>> = { en, hi };

let language: LanguageCode = "en";
const listeners = new Set<() => void>();
const pluralRules = new Map<LanguageCode, Intl.PluralRules>();

function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((option) => option.code === value);
}

export function resolveLanguage(setting: string | null | undefined, systemLocales: readonly string[] | null = []): LanguageCode {
  if (isLanguageCode(setting)) return setting;
  for (const locale of systemLocales ?? []) {
    const base = String(locale).toLowerCase().split(/[-_]/)[0];
    if (isLanguageCode(base)) return base;
  }
  return "en";
}

export function currentLanguage(): LanguageCode {
  return language;
}

export function setLanguage(code: LanguageCode): void {
  if (!isLanguageCode(code)) return;
  if (typeof document !== "undefined") document.documentElement.lang = code;
  if (code === language) return;
  language = code;
  listeners.forEach((listener) => listener());
}

export function applyLanguageSetting(setting: string | null | undefined): void {
  setLanguage(resolveLanguage(setting, typeof navigator !== "undefined" ? navigator.languages : []));
}

function pluralCategory(code: LanguageCode, count: number): string {
  try {
    let rules = pluralRules.get(code);
    if (!rules) {
      rules = new Intl.PluralRules(code);
      pluralRules.set(code, rules);
    }
    return rules.select(count);
  } catch {
    return count === 1 ? "one" : "other";
  }
}

function firstMatch(catalog: Partial<Record<string, string>>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = catalog[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function t(key: TKey, params?: Params): string {
  try {
    const keys: string[] = [key];
    const count = params?.count;
    if (typeof count === "number" && Number.isFinite(count)) {
      keys.unshift(`${key}.${pluralCategory(language, count)}`, `${key}.other`);
    }
    const text = firstMatch(CATALOGS[language], keys) ?? firstMatch(en, keys) ?? key;
    return interpolate(text, params);
  } catch {
    return key;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): LanguageCode {
  return language;
}

export function useT(): typeof t {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return t;
}

if (typeof document !== "undefined") document.documentElement.lang = language;
