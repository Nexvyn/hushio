import { ADDON_LIMIT, AddonError, type AddonHealth, type AddonManifest, type AddonSetting, type AddonSource } from "./types";

const ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const SETTING_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const ID_MAX = 64;
const KEY_MAX = 40;
const NAME_MAX = 80;
const VERSION_MAX = 32;
const RESOURCE_MAX = 32;
const RESOURCES_MAX = 10;
const SETTINGS_MAX = 20;
const OPTIONS_MAX = 50;
const OPTION_MAX = 80;
const URL_MAX = 300;
const REQUIRED_RESOURCES = ["search", "stream"];
const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|\[)|\.(local|internal)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value.trim() : null;
}

export function normalizeAddonUrl(input: string): string {
  const raw = input.trim();
  if (raw === "") throw new AddonError("Enter the add-on's address");
  if (raw.length > URL_MAX) throw new AddonError("That address is too long");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AddonError("That is not a web address");
  }
  if (url.protocol !== "https:") throw new AddonError("Add-ons must use https://");
  if (url.username || url.password) throw new AddonError("Remove the user name and password from the address");
  if (url.search || url.hash) throw new AddonError("Enter the add-on's base address, without a ? or #");
  if (PRIVATE_HOST.test(url.hostname)) throw new AddonError("Add-ons must be on a public address");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function resourcesOf(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > RESOURCES_MAX) {
    throw new AddonError("The manifest's resources list is not valid");
  }
  const list: string[] = [];
  for (const item of value) {
    const resource = text(item, RESOURCE_MAX);
    if (!resource) throw new AddonError("The manifest's resources list is not valid");
    list.push(resource.toLowerCase());
  }
  if (!REQUIRED_RESOURCES.every((required) => list.includes(required))) {
    throw new AddonError("This add-on does not offer search and stream");
  }
  return list;
}

function optionValue(value: unknown): string {
  const raw = isRecord(value) ? value.value : value;
  if (typeof raw !== "string" && typeof raw !== "number") throw new AddonError("A setting option is not valid");
  const result = String(raw);
  if (result.length > OPTION_MAX) throw new AddonError("A setting option is too long");
  return result;
}

function settingOf(value: unknown): AddonSetting {
  if (!isRecord(value)) throw new AddonError("A setting in the manifest is not valid");
  const key = text(value.key, KEY_MAX);
  if (!key || !SETTING_KEY_PATTERN.test(key)) throw new AddonError("A setting in the manifest has no valid key");
  const raw = value.default;
  let defaultValue: string | null = null;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") {
      throw new AddonError(`The default for ${key} is not valid`);
    }
    defaultValue = String(raw);
    if (defaultValue.length > OPTION_MAX) throw new AddonError(`The default for ${key} is too long`);
  }
  const options = value.options;
  if (options !== undefined && options !== null && (!Array.isArray(options) || options.length > OPTIONS_MAX)) {
    throw new AddonError(`The options for ${key} are not valid`);
  }
  const list = Array.isArray(options) ? options.map(optionValue) : [];
  return { key, defaultValue, options: list };
}

function settingsOf(value: unknown): AddonSetting[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > SETTINGS_MAX) throw new AddonError("The manifest's settings are not valid");
  return value.map(settingOf);
}

export function validateManifest(raw: unknown): AddonManifest {
  if (!isRecord(raw)) throw new AddonError("That URL answered, but not with an add-on manifest");
  const id = text(raw.id, ID_MAX);
  if (!id || !ID_PATTERN.test(id)) throw new AddonError("The manifest needs a valid id");
  const name = raw.name === undefined || raw.name === null ? id : text(raw.name, NAME_MAX);
  const version = raw.version === undefined || raw.version === null ? "" : text(raw.version, VERSION_MAX);
  if (name === null || version === null) throw new AddonError("The manifest's name or version is not valid");
  if (raw.bitchordAuth !== undefined && raw.bitchordAuth !== null && raw.bitchordAuth !== false) {
    throw new AddonError("This add-on needs sign-in, which the app does not support");
  }
  return { id, name: name || id, version, resources: resourcesOf(raw.resources), settings: settingsOf(raw.settings) };
}

function storedManifest(value: unknown): AddonManifest | null {
  if (!isRecord(value)) return null;
  const id = text(value.id, ID_MAX);
  const name = text(value.name, NAME_MAX);
  const version = text(value.version, VERSION_MAX);
  if (!id || !ID_PATTERN.test(id) || name === null || version === null) return null;
  if (!Array.isArray(value.resources) || !Array.isArray(value.settings)) return null;
  if (!value.resources.every((item) => typeof item === "string")) return null;
  const resources = value.resources as string[];
  if (!REQUIRED_RESOURCES.every((required) => resources.includes(required))) return null;
  const settings: AddonSetting[] = [];
  for (const entry of value.settings) {
    if (!isRecord(entry) || typeof entry.key !== "string") return null;
    const defaultValue = entry.defaultValue;
    if (defaultValue !== null && typeof defaultValue !== "string") return null;
    if (!Array.isArray(entry.options) || !entry.options.every((item) => typeof item === "string")) return null;
    settings.push({ key: entry.key, defaultValue, options: entry.options as string[] });
  }
  return { id, name, version, resources, settings };
}

function healthOf(value: unknown): AddonHealth | null {
  if (!isRecord(value)) return null;
  const { ok, latencyMs, checkedAt, error } = value;
  if (typeof ok !== "boolean" || typeof latencyMs !== "number" || typeof checkedAt !== "number") return null;
  if (typeof error !== "string" && error !== null) return null;
  return { ok, latencyMs, checkedAt, error };
}

function sourceOf(value: unknown): AddonSource | null {
  if (!isRecord(value)) return null;
  const id = text(value.id, ID_MAX);
  const name = text(value.name, NAME_MAX);
  const manifest = storedManifest(value.manifest);
  if (!id || name === null || !manifest || manifest.id !== id) return null;
  if (typeof value.baseUrl !== "string") return null;
  let baseUrl: string;
  try {
    baseUrl = normalizeAddonUrl(value.baseUrl);
  } catch {
    return null;
  }
  if (typeof value.enabled !== "boolean" || typeof value.priority !== "number" || !Number.isFinite(value.priority)) {
    return null;
  }
  return {
    id,
    name: name || id,
    baseUrl,
    manifest,
    enabled: value.enabled,
    priority: value.priority,
    lastHealth: healthOf(value.lastHealth),
  };
}

export function parseAddonSources(value: unknown): AddonSource[] | null {
  if (!Array.isArray(value) || value.length > ADDON_LIMIT) return null;
  const parsed: AddonSource[] = [];
  for (const entry of value) {
    const source = sourceOf(entry);
    if (!source) return null;
    if (parsed.some((item) => item.id === source.id || item.baseUrl === source.baseUrl)) return null;
    parsed.push(source);
  }
  return withPriorities(parsed.sort((a, b) => a.priority - b.priority));
}

function withPriorities(list: readonly AddonSource[]): AddonSource[] {
  return list.map((source, priority) => ({ ...source, priority }));
}

export function sortedAddons(list: readonly AddonSource[]): AddonSource[] {
  return [...list].sort((a, b) => a.priority - b.priority);
}

export function enabledAddons(list: readonly AddonSource[]): AddonSource[] {
  return sortedAddons(list).filter((source) => source.enabled);
}

export function sourceFromManifest(baseUrl: string, manifest: AddonManifest): AddonSource {
  return {
    id: manifest.id,
    name: manifest.name || manifest.id,
    baseUrl,
    manifest,
    enabled: true,
    priority: 0,
    lastHealth: null,
  };
}

export function addAddonSource(list: readonly AddonSource[], source: AddonSource): AddonSource[] {
  if (list.length >= ADDON_LIMIT) throw new AddonError(`You can add up to ${ADDON_LIMIT} add-ons`);
  if (list.some((item) => item.id === source.id || item.baseUrl === source.baseUrl)) {
    throw new AddonError("This add-on is already added");
  }
  return withPriorities([...sortedAddons(list), source]);
}

export function removeAddonSource(list: readonly AddonSource[], id: string): AddonSource[] {
  return withPriorities(sortedAddons(list).filter((source) => source.id !== id));
}

export function moveAddonSource(list: readonly AddonSource[], id: string, delta: -1 | 1): AddonSource[] {
  const sorted = sortedAddons(list);
  const from = sorted.findIndex((source) => source.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sorted.length) return sorted;
  [sorted[from], sorted[to]] = [sorted[to], sorted[from]];
  return withPriorities(sorted);
}

export function setAddonEnabled(list: readonly AddonSource[], id: string, enabled: boolean): AddonSource[] {
  return list.map((source) => (source.id === id ? { ...source, enabled } : source));
}

export function setAddonHealth(list: readonly AddonSource[], id: string, health: AddonHealth): AddonSource[] {
  return list.map((source) => (source.id === id ? { ...source, lastHealth: health } : source));
}

export function importedAddonSources(list: readonly AddonSource[]): AddonSource[] {
  return list.map((source) => ({ ...source, enabled: false }));
}
