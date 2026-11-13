export type PipRepeat = "off" | "all" | "one";

export type PipTrackInfo = {
  id: string;
  title: string;
  artist: string;
  album: string;
  thumb: string;
};

export type PipSnapshot = {
  track: PipTrackInfo | null;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: PipRepeat;
  liked: boolean;
};

export type PipCommand =
  | { type: "toggle" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "seek"; sec: number }
  | { type: "volume"; v: number }
  | { type: "mute" }
  | { type: "shuffle" }
  | { type: "repeat" }
  | { type: "like" };
