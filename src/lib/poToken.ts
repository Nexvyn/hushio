import { ytFetch as fetch } from "./ytFetch";
import { BotGuardClient } from "bgutils-js/botguard";
import type { IntegrityTokenData, WebPoSignalOutput } from "bgutils-js/shared-types";
import { buildURL, parseLooseJSON } from "bgutils-js/utils";
import { WebPoMinter } from "bgutils-js/webpo";

const FETCH_TIMEOUT_MS = 15_000;
const SNAPSHOT_TIMEOUT_MS = 20_000;
const TOKEN_TTL_MS = 3 * 60 * 60 * 1000;
const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
const GOOG_API_KEY = "AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ATTESTATION_CLIENT_VERSION = "2.20260817.01.00";
const YOUTUBE_ORIGIN = "https://www.youtube.com";

const WAA_HEADERS = {
  "content-type": "application/json+protobuf",
  "x-goog-api-key": GOOG_API_KEY,
  "x-user-agent": "grpc-web-javascript/0.1",
  "user-agent": USER_AGENT,
};

type RawChallenge = {
  program?: string;
  globalName?: string;
  interpreterUrl?: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string };
  interpreterJavascript?: { privateDoNotAccessOrElseSafeScriptWrappedValue?: string };
};

type Challenge = {
  program: string;
  globalName: string;
  interpreterJS: string;
  ytcfg: Record<string, unknown> | null;
};

type Minted = { poToken: string; visitorData: string; mintedAt: number };

let cached: Minted | null = null;
let inFlight: { visitorData: string; promise: Promise<Minted> } | null = null;
let evalAllowed: boolean | null = null;

export function canEvaluate(): boolean {
  if (evalAllowed === null) {
    try {
      new Function("return 1")();
      evalAllowed = true;
    } catch {
      evalAllowed = false;
    }
  }
  return evalAllowed;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseYtcfg(json: string | undefined): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function fetchInterpreter(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return response.text();
}

async function toChallenge(
  raw: RawChallenge | undefined,
  ytcfg: Record<string, unknown> | null,
): Promise<Challenge | undefined> {
  if (!raw?.program || !raw.globalName) return undefined;
  const inline = raw.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  const url = raw.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  const interpreterJS = inline ?? (url ? await fetchInterpreter(`https:${url}`) : undefined);
  if (!interpreterJS) return undefined;
  return { program: raw.program, globalName: raw.globalName, interpreterJS, ytcfg };
}

async function fetchChallengeFromHomepage(): Promise<Challenge | undefined> {
  try {
    const response = await fetch(YOUTUBE_ORIGIN, {
      headers: { accept: "*/*", "accept-language": "en-US,en;q=0.7", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const html = await response.text();
    const ytcfgJson = /ytcfg\.set\(({.+?})\);/s.exec(html)?.[1];
    const challengeJson = /window\.ytAtN\(\s*({[\s\S]*?})\s*\)/.exec(html)?.[1];
    const raw = challengeJson ? parseLooseJSON(challengeJson) : undefined;
    return await toChallenge(raw, parseYtcfg(ytcfgJson));
  } catch (error) {
    console.warn(`[hushio] homepage challenge fetch failed: ${describeError(error)}`);
    return undefined;
  }
}

async function fetchChallengeFromAttGet(): Promise<Challenge | undefined> {
  const response = await fetch(`${YOUTUBE_ORIGIN}/youtubei/v1/att/get?prettyPrint=false`, {
    method: "POST",
    headers: WAA_HEADERS,
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: ATTESTATION_CLIENT_VERSION } },
      engagementType: "ENGAGEMENT_TYPE_UNBOUND",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data: { attestation?: { bgChallenge?: RawChallenge } } = await response.json();
  return toChallenge(data.attestation?.bgChallenge, null);
}

function parseGenerateIT(data: unknown, status: number): IntegrityTokenData {
  let parsed: IntegrityTokenData;
  if (Array.isArray(data)) {
    parsed = {
      integrityToken: data.find((item): item is string => typeof item === "string" && item.length >= 40),
      estimatedTtlSecs: data.find((item): item is number => typeof item === "number"),
    };
  } else if (typeof data === "object" && data !== null) {
    const record = data as {
      integrityToken?: string;
      token?: string;
      estimatedTtlSecs?: number;
      mintRefreshThreshold?: number;
    };
    parsed = {
      integrityToken: record.integrityToken ?? record.token,
      estimatedTtlSecs: record.estimatedTtlSecs,
      mintRefreshThreshold: record.mintRefreshThreshold,
    };
  } else {
    throw new Error(`GenerateIT returned an unexpected response shape (HTTP ${status})`);
  }
  if (!parsed.integrityToken) {
    throw new Error(
      `GenerateIT returned no integrity token (HTTP ${status}): ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  return { ...parsed, websafeFallbackToken: parsed.integrityToken };
}

async function mintWithChallenge(challenge: Challenge, visitorData: string): Promise<Minted> {
  if (challenge.ytcfg) Object.assign(globalThis, { yt: { config_: challenge.ytcfg } });
  if (!(challenge.globalName in globalThis)) new Function(challenge.interpreterJS)();
  if (!(challenge.globalName in globalThis)) {
    throw new Error(`Interpreter did not define global '${challenge.globalName}'`);
  }

  const botguard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });
  try {
    const webPoSignalOutput: WebPoSignalOutput = [];
    const snapshot = await botguard.snapshot({ webPoSignalOutput }, SNAPSHOT_TIMEOUT_MS);
    if (!snapshot) throw new Error("BotGuard snapshot returned nothing");

    const response = await fetch(buildURL("GenerateIT"), {
      method: "POST",
      headers: WAA_HEADERS,
      body: JSON.stringify([REQUEST_KEY, snapshot]),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const integrity = parseGenerateIT(await response.json(), response.status);

    const minter = await WebPoMinter.create(integrity, webPoSignalOutput);
    const poToken = await minter.mintAsWebsafeString(visitorData);
    if (!poToken) throw new Error("Minting returned no token");
    return { poToken, visitorData, mintedAt: Date.now() };
  } finally {
    botguard.shutdown().catch((error: unknown) => {
      console.warn(`[hushio] BotGuard shutdown failed: ${describeError(error)}`);
    });
  }
}

async function mint(visitorData: string): Promise<Minted> {
  if (!canEvaluate()) throw new Error("the app's content security policy blocks running BotGuard");
  const homepage = await fetchChallengeFromHomepage();
  if (homepage) {
    try {
      return await mintWithChallenge(homepage, visitorData);
    } catch (error) {
      if (!homepage.ytcfg) throw error;
      console.warn(`[hushio] homepage PO token mint failed, retrying with att/get: ${describeError(error)}`);
    }
  }
  const attGet = await fetchChallengeFromAttGet();
  if (!attGet) throw new Error("youtube.com returned no BotGuard challenge");
  return mintWithChallenge(attGet, visitorData);
}

export async function getPoToken(visitorData: string): Promise<string> {
  if (cached?.visitorData === visitorData && Date.now() - cached.mintedAt < TOKEN_TTL_MS) {
    return cached.poToken;
  }
  if (inFlight === null || inFlight.visitorData !== visitorData) {
    inFlight = { visitorData, promise: mint(visitorData) };
  }
  const attempt = inFlight;
  try {
    const minted = await attempt.promise;
    if (inFlight === attempt) cached = minted;
    return minted.poToken;
  } catch (error) {
    throw new Error(`PO token minting failed: ${describeError(error)}`, { cause: error });
  } finally {
    if (inFlight === attempt) inFlight = null;
  }
}

export function invalidatePoToken(): void {
  cached = null;
  inFlight = null;
}
