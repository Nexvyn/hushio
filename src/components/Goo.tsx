import { useEffect } from "react";
import type { Variants } from "motion/react";
import { DURATION_MS, EASE_OUT, glide } from "../lib/motion";

export const GOO_FILTER_ID = "goo";

export const GOO_SHAPE = "absolute left-0 right-0 rounded-[12px] [corner-shape:squircle] bg-elevated";

export const GOO_LAYER_STYLE = { filter: `url(#${GOO_FILTER_ID})` } as const;

const SVG_NS = "http://www.w3.org/2000/svg";

function appendGooFilter() {
  if (document.getElementById(GOO_FILTER_ID)) return;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", GOO_FILTER_ID);
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const blur = document.createElementNS(SVG_NS, "feGaussianBlur");
  blur.setAttribute("in", "SourceGraphic");
  blur.setAttribute("stdDeviation", "8");
  blur.setAttribute("result", "blur");
  const matrix = document.createElementNS(SVG_NS, "feColorMatrix");
  matrix.setAttribute("in", "blur");
  matrix.setAttribute("mode", "matrix");
  matrix.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7");
  filter.append(blur, matrix);
  svg.append(filter);
  document.body.append(svg);
}

export function GooFilter() {
  useEffect(appendGooFilter, []);
  return null;
}

export function gooVariants(reduced: boolean): { stretch: Variants; reveal: Variants } {
  if (reduced) {
    const instant = { duration: 0 };
    return {
      stretch: {
        initial: { scaleY: 1 },
        animate: { scaleY: 1, transition: instant },
        exit: { scaleY: 1, transition: instant },
      },
      reveal: {
        initial: { opacity: 1 },
        animate: { opacity: 1, transition: instant },
        exit: { opacity: 1, transition: instant },
      },
    };
  }
  return {
    stretch: {
      initial: { scaleY: 0 },
      animate: { scaleY: 1, transition: glide },
      exit: { scaleY: 0, transition: { duration: DURATION_MS.gooOut / 1000, ease: EASE_OUT } },
    },
    reveal: {
      initial: { opacity: 0 },
      animate: {
        opacity: 1,
        transition: { duration: DURATION_MS.gooFade / 1000, delay: DURATION_MS.gooDelay / 1000, ease: EASE_OUT },
      },
      exit: { opacity: 0, transition: { duration: DURATION_MS.gooOut / 1000, ease: EASE_OUT } },
    },
  };
}
