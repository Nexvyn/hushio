import { useEffect, useRef, useState } from "react";

type AboutTextProps = {
  heading: string;
  text: string;
};

export function AboutText({ heading, text }: AboutTextProps) {
  const body = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const measure = () => {
      const element = body.current;
      if (element) setClipped(element.scrollHeight > element.clientHeight + 2);
    };
    measure();
    const timer = window.setTimeout(measure, 50);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  const showToggle = clipped || expanded;
  const toggle = () => setExpanded((value) => !value);

  return (
    <section>
      <h2 className="mb-2 text-card-title font-semibold text-ink-1">{heading}</h2>
      <p
        ref={body}
        style={expanded ? undefined : { WebkitLineClamp: 3 }}
        onClick={() => {
          if (showToggle) toggle();
        }}
        className={`whitespace-pre-line text-body leading-relaxed text-ink-2 ${expanded ? "" : "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical]"}`}
      >
        {text}
      </p>
      {showToggle && (
        <button type="button" onClick={toggle} className="mt-1 text-meta font-semibold text-accent">
          {expanded ? "Less" : "More"}
        </button>
      )}
    </section>
  );
}
