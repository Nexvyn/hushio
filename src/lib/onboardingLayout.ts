export const REFERENCE_FRAME = { width: 390, height: 844 } as const;

export const PHONE_BREAKPOINT = 768;

const TITLE_TOP = 120;
const TITLE_SIZE = 35;
const TITLE_LINE_HEIGHT = 1.1;
const TITLE_LINES = 2;
const SUBTITLE_GAP = 20;
const SUBTITLE_SIZE = 13;
const SUBTITLE_LINE = 16;
const ACTION_HEIGHT = 56;
const ACTION_BOTTOM = 90;
const SIDE = 24;
const CAPTION_GAP = 24;
const CAPTION_LINE = 16;
const CENTRE_SHARE = 0.4;

export type OnboardingFrame = { width: number; height: number };

export type OnboardingLayout = {
  scale: number;
  side: number;
  title: { top: number; bottom: number; size: number; lineHeight: number };
  subtitle: { top: number; size: number; height: number };
  centre: { top: number; height: number; bottom: number };
  action: { top: number; height: number; bottom: number };
  caption: { top: number; height: number; size: number };
};

export function onboardingLayout(frame: OnboardingFrame): OnboardingLayout {
  const scale = frame.width / REFERENCE_FRAME.width;
  const s = (value: number) => value * scale;

  const titleTop = s(TITLE_TOP);
  const titleBottom = titleTop + s(TITLE_SIZE * TITLE_LINE_HEIGHT * TITLE_LINES);
  const subtitleTop = titleBottom + s(SUBTITLE_GAP);
  const subtitleBottom = subtitleTop + s(SUBTITLE_LINE);

  const actionHeight = s(ACTION_HEIGHT);
  const actionBottom = frame.height - s(ACTION_BOTTOM);
  const actionTop = actionBottom - actionHeight;

  const region = actionTop - subtitleBottom;
  const centreHeight = Math.min(frame.height * CENTRE_SHARE, region);
  const centreTop = subtitleBottom + (region - centreHeight) / 2;

  return {
    scale,
    side: s(SIDE),
    title: { top: titleTop, bottom: titleBottom, size: s(TITLE_SIZE), lineHeight: TITLE_LINE_HEIGHT },
    subtitle: { top: subtitleTop, size: s(SUBTITLE_SIZE), height: s(SUBTITLE_LINE) },
    centre: { top: centreTop, height: centreHeight, bottom: centreTop + centreHeight },
    action: { top: actionTop, height: actionHeight, bottom: actionBottom },
    caption: { top: actionBottom + s(CAPTION_GAP), height: s(CAPTION_LINE), size: s(SUBTITLE_SIZE) },
  };
}
