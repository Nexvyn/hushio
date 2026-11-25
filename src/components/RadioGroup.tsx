import { useRef, type KeyboardEvent } from "react";
import { SETTINGS_RADIUS, SETTINGS_SIZE, SETTINGS_TYPE } from "../lib/settingsDesign";

export type RadioOption<T extends string> = { value: T; label: string };

type RadioGroupProps<T extends string> = {
  label: string;
  options: readonly RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  chips?: boolean;
};

const STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

export function RadioGroup<T extends string>({ label, options, value, onChange, chips = false }: RadioGroupProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={
        chips
          ? "no-scrollbar -mx-1 flex max-w-full gap-2 overflow-x-auto px-1"
          : `flex shrink-0 gap-0.5 bg-wash ${SETTINGS_RADIUS.control} ${SETTINGS_SIZE.control}`
      }
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`${SETTINGS_TYPE.segment} ${SETTINGS_RADIUS.segment} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out ${
              checked ? "bg-ink-1 text-[rgb(var(--base))]" : chips ? "bg-wash text-ink-2 hover:text-ink-1" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
