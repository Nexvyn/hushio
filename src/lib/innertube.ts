import { ytFetch as fetch } from "./ytFetch";
import { Innertube } from "youtubei.js";
import { getPoToken, invalidatePoToken } from "./poToken";

export type Market = { location: string; lang: string };

export type SessionContext = {
  visitorData: string;
  poToken: string | null;
  gl: string;
  hl: string;
};

export type InnertubeSession = {
  innertube: Innertube;
  context: SessionContext;
};

let session: Promise<InnertubeSession> | null = null;

async function mintPoToken(visitorData: string): Promise<string | null> {
  if (!visitorData) return null;
  try {
    return await getPoToken(visitorData);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[hushio] PO token minting failed, continuing without: ${reason}`);
    return null;
  }
}

async function createSession({ location, lang }: Market): Promise<InnertubeSession> {
  const bootstrap = await Innertube.create({
    retrieve_player: false,
    enable_session_cache: false,
    location,
    lang,
    fetch,
  });
  const visitorData = bootstrap.session.context.client.visitorData ?? "";
  const poToken = await mintPoToken(visitorData);
  const innertube = await Innertube.create({
    retrieve_player: true,
    enable_session_cache: false,
    visitor_data: visitorData,
    po_token: poToken ?? undefined,
    location,
    lang,
    fetch,
  });
  console.info(`[hushio] innertube session: gl=${location} hl=${lang}`);
  return { innertube, context: { visitorData, poToken, gl: location, hl: lang } };
}

export function getSession(market: Market): Promise<InnertubeSession> {
  session ??= createSession(market).catch((error: unknown) => {
    session = null;
    throw error;
  });
  return session;
}

export function resetSession(market: Market): Promise<InnertubeSession> {
  session = null;
  invalidatePoToken();
  return getSession(market);
}

export async function getSessionContext(market: Market): Promise<SessionContext> {
  return (await getSession(market)).context;
}
