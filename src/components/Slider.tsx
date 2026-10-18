type SliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export function Slider({ label, min, max, step, value, onChange, disabled = false }: SliderProps) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-40 shrink-0 cursor-pointer accent-ink-1 disabled:cursor-default disabled:opacity-[var(--disabled-opacity)]"
    />
  );
}
