import { APP_NAME } from "./app";
import { copyImage } from "./bridge";
import { fmtHours, fmtMinutes, type ReplayData } from "./replay";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;
export const COVER_TIMEOUT_MS = 8000;
export const NEUTRAL_COLORS: [string, string] = ["60 60 64", "40 40 44"];

const PAD = 84;
const DISPLAY = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
const BODY = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
const BACKGROUND = "#0b0b0d";
const RECORD = "#0e0e10";
const SPINDLE = "#050505";
const SLEEVE = "#111111";
const TILE = "rgb(255 255 255 / 0.08)";
const WHITE = "#ffffff";

export type CardSong = { title: string; artist: string; thumb: string | null };
export type CardArtist = { name: string; thumb: string | null; detail: string };

export type ReplayCardInput = {
  periodLabel: string;
  minutes: number;
  plays: number;
  activeDays: number;
  streak: number;
  songs: CardSong[];
  artists: CardArtist[];
  sleeve: string | null;
  label: string | null;
  colors: [string, string];
};

export type CardImages = Map<string, HTMLImageElement | null>;

export function lift(triplet: string, amount: number): string {
  return triplet
    .split(" ")
    .map((channel) => Math.min(255, Number(channel) + amount))
    .join(" ");
}

export function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}…`;
    if (ctx.measureText(candidate).width <= max) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  radius: number,
) {
  ctx.save();
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.clip();
  if (image) drawCover(ctx, image, x, y, size, size);
  else {
    ctx.fillStyle = TILE;
    ctx.fill();
  }
  ctx.restore();
}

function drawRecord(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  label: HTMLImageElement | null,
  tint: string,
) {
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 0.55)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = RECORD;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "rgb(0 0 0 / 0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.save();
  ctx.clip();
  ctx.fillStyle = `rgb(${tint} / 0.1)`;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  let ring = 0;
  for (let radius = r * 0.36; radius < r * 0.97; radius += 3.2) {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = ring % 2 === 0 ? "rgb(255 255 255 / 0.035)" : "rgb(0 0 0 / 0.3)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ring += 1;
  }
  const sheen = ctx.createConicGradient(-0.5, cx, cy);
  sheen.addColorStop(0, "rgb(255 255 255 / 0.16)");
  sheen.addColorStop(0.13, "rgb(255 255 255 / 0)");
  sheen.addColorStop(0.5, "rgb(255 255 255 / 0)");
  sheen.addColorStop(0.63, "rgb(255 255 255 / 0.1)");
  sheen.addColorStop(0.78, "rgb(255 255 255 / 0)");
  sheen.addColorStop(1, "rgb(255 255 255 / 0.16)");
  ctx.fillStyle = sheen;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const labelRadius = r * 0.34;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
  ctx.clip();
  if (label) {
    ctx.translate(cx, cy);
    ctx.rotate(-0.22);
    drawCover(ctx, label, -labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
  } else {
    ctx.fillStyle = `rgb(${tint} / 0.9)`;
    ctx.fillRect(cx - labelRadius, cy - labelRadius, labelRadius * 2, labelRadius * 2);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgb(0 0 0 / 0.4)";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.03, 0, Math.PI * 2);
  ctx.fillStyle = SPINDLE;
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawRecordAndSleeve(
  ctx: CanvasRenderingContext2D,
  card: ReplayCardInput,
  images: CardImages,
) {
  const [tint] = card.colors;
  const sleeveImage = card.sleeve ? (images.get(card.sleeve) ?? null) : null;
  const labelImage = card.label ? (images.get(card.label) ?? null) : null;
  const hasSleeve = card.sleeve !== null;
  const cx = hasSleeve ? 644 : 540;
  const cy = 500;

  for (let radius = 300, index = 0; radius < 1600; radius += 34, index += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgb(255 255 255 / ${Math.max(0, 0.055 - index * 0.0016)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (!hasSleeve) {
    drawRecord(ctx, cx, cy, 280, labelImage, tint);
    return;
  }
  drawRecord(ctx, cx, cy, 252, labelImage, tint);
  ctx.save();
  ctx.translate(334, cy);
  ctx.rotate(-0.05);
  ctx.shadowColor = "rgb(0 0 0 / 0.6)";
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 34;
  roundRectPath(ctx, -250, -250, 500, 500, 14);
  ctx.fillStyle = SLEEVE;
  ctx.fill();
  ctx.shadowColor = "rgb(0 0 0 / 0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  drawTile(ctx, sleeveImage, -250, -250, 500, 14);
  ctx.restore();
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  x: number,
  heading: string,
  rows: { main: string; sub: string; thumb: string | null }[],
  radius: number,
  images: CardImages,
) {
  if (rows.length === 0) return;
  ctx.font = `700 25px ${BODY}`;
  ctx.letterSpacing = "6px";
  ctx.fillStyle = "rgb(255 255 255 / 0.6)";
  ctx.fillText(heading, x, 1196);
  ctx.letterSpacing = "0px";
  rows.slice(0, 5).forEach((row, index) => {
    const y = 1228 + index * 106;
    ctx.font = `800 30px ${DISPLAY}`;
    ctx.fillStyle = index === 0 ? WHITE : "rgb(255 255 255 / 0.45)";
    ctx.fillText(String(index + 1).padStart(2, "0"), x, y + 50);
    drawTile(ctx, row.thumb ? (images.get(row.thumb) ?? null) : null, x + 40, y + 4, 76, radius);
    ctx.font = `700 29px ${BODY}`;
    ctx.fillStyle = WHITE;
    ctx.fillText(fit(ctx, row.main, 300), x + 134, y + 38);
    ctx.font = `500 24px ${BODY}`;
    ctx.fillStyle = "rgb(255 255 255 / 0.6)";
    ctx.fillText(fit(ctx, row.sub, 300), x + 134, y + 72);
  });
}

export function drawReplayCard(ctx: CanvasRenderingContext2D, card: ReplayCardInput, images: CardImages): void {
  const [tint, glow] = card.colors;
  const label = card.label ? (images.get(card.label) ?? null) : null;

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  if (label) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.filter = "blur(90px) saturate(1.3)";
    drawCover(ctx, label, -260, -260, 1600, 1240);
    ctx.restore();
  }

  const wash = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  wash.addColorStop(0, `rgb(${tint} / 0.78)`);
  wash.addColorStop(0.42, `rgb(${tint} / 0.3)`);
  wash.addColorStop(0.78, "rgb(11 11 13 / 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glowGradient = ctx.createRadialGradient(950.4, 192, 0, 950.4, 192, 1080);
  glowGradient.addColorStop(0, `rgb(${glow} / 0.55)`);
  glowGradient.addColorStop(1, `rgb(${glow} / 0)`);
  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const shade = ctx.createLinearGradient(0, CARD_HEIGHT * 0.4, 0, CARD_HEIGHT);
  shade.addColorStop(0, "rgb(8 8 10 / 0)");
  shade.addColorStop(0.45, "rgb(8 8 10 / 0.72)");
  shade.addColorStop(1, "rgb(8 8 10 / 0.94)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const grain = document.createElement("canvas");
  grain.width = 180;
  grain.height = 180;
  const grainContext = grain.getContext("2d");
  if (grainContext) {
    const noise = grainContext.createImageData(180, 180);
    for (let i = 0; i < noise.data.length; i += 4) {
      const value = Math.random() * 255;
      noise.data[i] = value;
      noise.data[i + 1] = value;
      noise.data[i + 2] = value;
      noise.data[i + 3] = 255;
    }
    grainContext.putImageData(noise, 0, 0);
    const pattern = ctx.createPattern(grain, "repeat");
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      ctx.restore();
    }
  }

  ctx.textAlign = "left";
  ctx.fillStyle = WHITE;
  ctx.font = `800 40px ${DISPLAY}`;
  ctx.fillText(APP_NAME, PAD, 128);

  ctx.textAlign = "right";
  ctx.font = `800 30px ${DISPLAY}`;
  ctx.letterSpacing = "8px";
  ctx.fillText("REPLAY", 1004, 118);
  ctx.letterSpacing = "0px";
  ctx.font = `500 30px ${BODY}`;
  ctx.fillStyle = "rgb(255 255 255 / 0.72)";
  ctx.fillText(fit(ctx, card.periodLabel, 420), 996, 160);
  ctx.textAlign = "left";

  drawRecordAndSleeve(ctx, card, images);

  ctx.font = `800 196px ${DISPLAY}`;
  ctx.letterSpacing = "-6px";
  ctx.fillStyle = WHITE;
  ctx.fillText(fit(ctx, card.minutes.toLocaleString(), 912), PAD - 6, 1000);
  ctx.letterSpacing = "7px";
  ctx.font = `700 28px ${BODY}`;
  ctx.fillStyle = `rgb(${lift(glow, 80)})`;
  ctx.fillText("MINUTES LISTENED", PAD, 1050);
  ctx.letterSpacing = "0px";

  const facts = [
    `${card.plays} ${card.plays === 1 ? "play" : "plays"}`,
    `${card.activeDays} ${card.activeDays === 1 ? "day" : "days"}`,
  ];
  if (card.streak > 1) facts.push(`${card.streak}-day streak`);
  ctx.font = `500 34px ${BODY}`;
  ctx.fillStyle = "rgb(255 255 255 / 0.88)";
  ctx.fillText(fit(ctx, facts.join("  ·  "), 912), PAD, 1108);

  drawColumn(
    ctx,
    PAD,
    "TOP SONGS",
    card.songs.map((song) => ({ main: song.title, sub: song.artist, thumb: song.thumb })),
    10,
    images,
  );
  drawColumn(
    ctx,
    562,
    "TOP ARTISTS",
    card.artists.map((artist) => ({ main: artist.name, sub: artist.detail, thumb: artist.thumb })),
    38,
    images,
  );

  ctx.fillStyle = "rgb(255 255 255 / 0.12)";
  ctx.fillRect(PAD, 1792, 912, 2);
  ctx.font = `500 26px ${BODY}`;
  ctx.fillStyle = "rgb(255 255 255 / 0.6)";
  ctx.fillText(`Your listening, counted by ${APP_NAME}`, PAD, 1850);
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function cardUrls(card: ReplayCardInput): string[] {
  const urls = [
    card.sleeve,
    card.label,
    ...card.songs.map((song) => song.thumb),
    ...card.artists.map((artist) => artist.thumb),
  ];
  return [...new Set(urls.filter((url): url is string => typeof url === "string" && url.length > 0))];
}

export async function loadCardImages(card: ReplayCardInput): Promise<CardImages> {
  const entries = await Promise.all(
    cardUrls(card).map(async (url) => [url, await withTimeout(loadImage(url), null, COVER_TIMEOUT_MS)] as const),
  );
  return new Map(entries);
}

export async function renderReplayCard(card: ReplayCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  drawReplayCard(context, card, await loadCardImages(card));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The card could not be encoded"));
    }, "image/png");
  });
}

export async function copyReplayCard(blob: Blob): Promise<void> {
  await copyImage(new Uint8Array(await blob.arrayBuffer()));
}

export function buildReplayCard(input: {
  data: ReplayData;
  periodLabel: string;
  activeDays: number;
  streak: number;
  tint: string;
}): ReplayCardInput {
  const { data, periodLabel, activeDays, streak, tint } = input;
  const [top] = data.tracks;
  return {
    periodLabel,
    minutes: fmtMinutes(data.totalMs),
    plays: data.plays,
    activeDays,
    streak,
    songs: data.tracks.slice(0, 5).map((track) => ({ title: track.title, artist: track.artist, thumb: track.thumb })),
    artists: data.artists.slice(0, 5).map((artist) => ({ name: artist.name, thumb: null, detail: fmtHours(artist.ms) })),
    sleeve: data.albums[0]?.thumb ?? null,
    label: top?.thumb ?? null,
    colors: [tint, lift(tint, 40)],
  };
}
