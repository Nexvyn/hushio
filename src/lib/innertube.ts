import { fetch } from "@tauri-apps/plugin-http";
import { Innertube } from "youtubei.js";

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

async function createSession({ location, lang }: Market): Promise<InnertubeSession> {
  const bootstrap = await Innertube.create({
    retrieve_player: false,
    enable_session_cache: false,
    location,
    lang,
    fetch,
  });
  const visitorData = bootstrap.session.context.client.visitorData ?? "";
  const innertube = await Innertube.create({
    retrieve_player: true,
    enable_session_cache: false,
    visitor_data: visitorData,
    location,
    lang,
    fetch,
  });
  console.info(`[hushio] innertube session: gl=${location} hl=${lang}`);
  return { innertube, context: { visitorData, poToken: null, gl: location, hl: lang } };
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
  return getSession(market);
}

export async function getSessionContext(market: Market): Promise<SessionContext> {
  return (await getSession(market)).context;
}
