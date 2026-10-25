import { APP_SLUG } from "./app";
import type { Market } from "./innertube";

export const DEFAULT_MARKET = "US";

const ZONE_COUNTRY: Record<string, string> = {
  "asia/kolkata": "IN",
  "asia/calcutta": "IN",
  "asia/karachi": "PK",
  "asia/dhaka": "BD",
  "asia/colombo": "LK",
  "asia/kathmandu": "NP",
  "america/new_york": "US",
  "america/detroit": "US",
  "america/chicago": "US",
  "america/denver": "US",
  "america/phoenix": "US",
  "america/los_angeles": "US",
  "america/anchorage": "US",
  "pacific/honolulu": "US",
  "america/toronto": "CA",
  "america/vancouver": "CA",
  "america/winnipeg": "CA",
  "america/halifax": "CA",
  "america/mexico_city": "MX",
  "america/guatemala": "GT",
  "america/sao_paulo": "BR",
  "america/bahia": "BR",
  "america/fortaleza": "BR",
  "america/bogota": "CO",
  "america/lima": "PE",
  "america/santiago": "CL",
  "america/buenos_aires": "AR",
  "america/montevideo": "UY",
  "europe/london": "GB",
  "europe/dublin": "IE",
  "europe/paris": "FR",
  "europe/madrid": "ES",
  "europe/barcelona": "ES",
  "europe/lisbon": "PT",
  "europe/berlin": "DE",
  "europe/munich": "DE",
  "europe/rome": "IT",
  "europe/milan": "IT",
  "europe/amsterdam": "NL",
  "europe/brussels": "BE",
  "europe/vienna": "AT",
  "europe/zurich": "CH",
  "europe/prague": "CZ",
  "europe/warsaw": "PL",
  "europe/budapest": "HU",
  "europe/bucharest": "RO",
  "europe/athens": "GR",
  "europe/stockholm": "SE",
  "europe/oslo": "NO",
  "europe/copenhagen": "DK",
  "europe/helsinki": "FI",
  "europe/moscow": "RU",
  "europe/saint_petersburg": "RU",
  "europe/kiev": "UA",
  "europe/kyiv": "UA",
  "europe/istanbul": "TR",
  "europe/minsk": "BY",
  "asia/tokyo": "JP",
  "asia/seoul": "KR",
  "asia/shanghai": "CN",
  "asia/hong_kong": "HK",
  "asia/taipei": "TW",
  "asia/singapore": "SG",
  "asia/kuala_lumpur": "MY",
  "asia/manila": "PH",
  "asia/jakarta": "ID",
  "asia/bangkok": "TH",
  "asia/ho_chi_minh": "VN",
  "asia/hanoi": "VN",
  "asia/dubai": "AE",
  "asia/riyadh": "SA",
  "asia/qatar": "QA",
  "asia/kuwait": "KW",
  "asia/jerusalem": "IL",
  "asia/tel_aviv": "IL",
  "asia/amman": "JO",
  "asia/beirut": "LB",
  "asia/tehran": "IR",
  "africa/cairo": "EG",
  "africa/lagos": "NG",
  "africa/nairobi": "KE",
  "africa/accra": "GH",
  "africa/johannesburg": "ZA",
  "africa/casablanca": "MA",
  "australia/sydney": "AU",
  "australia/melbourne": "AU",
  "australia/brisbane": "AU",
  "australia/perth": "AU",
  "pacific/auckland": "NZ",
};

export type MarketSource = "override" | "os-region" | "timezone" | "default";

export type MarketSignals = {
  isDev: boolean;
  override: unknown;
  region: unknown;
  timeZone: unknown;
};

export type ResolvedMarket = { country: string; source: MarketSource };

export function normalizeCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const country = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

export function resolveMarket(signals: MarketSignals): ResolvedMarket {
  const override = signals.isDev ? normalizeCountry(signals.override) : null;
  if (override) return { country: override, source: "override" };

  const region = normalizeCountry(signals.region);
  if (region) return { country: region, source: "os-region" };

  const zone = typeof signals.timeZone === "string" ? ZONE_COUNTRY[signals.timeZone.toLowerCase()] : undefined;
  if (zone) return { country: zone, source: "timezone" };

  return { country: DEFAULT_MARKET, source: "default" };
}

export function displayLanguage(locale: unknown): string {
  if (typeof locale !== "string") return "en";
  const base = locale.split("-")[0]?.toLowerCase() ?? "";
  return /^[a-z]{2,3}$/.test(base) ? base : "en";
}

function regionOf(locale: unknown): string | undefined {
  if (typeof locale !== "string") return undefined;
  return locale
    .split("-")
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part));
}

function deviceSignals(): MarketSignals {
  return {
    isDev: import.meta.env.DEV,
    override: import.meta.env.HUSHIO_MARKET,
    region: regionOf(navigator.language),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

let resolved: Market | null = null;

export function marketValue(): Market {
  if (resolved) return resolved;
  const { country, source } = resolveMarket(deviceSignals());
  resolved = { location: country, lang: displayLanguage(navigator.language) };
  console.info(`[${APP_SLUG}] market: ${country} (${source})`);
  return resolved;
}
