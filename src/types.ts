export type Track = {
  id: string;
  title: string;
  artist: string;
  thumb: string | null;
  album?: string | null;
  duration?: number;
  episode?: true;
};
