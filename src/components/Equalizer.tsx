import type { ButtonHTMLAttributes } from "react";
import { openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import {
  addEqPreset,
  checkPresetName,
  clampEqGain,
  cleanPresetName,
  deleteEqPreset,
  EQ_BAND_LABELS,
  EQ_BAND_HIT,
  EQ_BANDS_HZ,
  EQ_H,
  EQ_PRESETS,
  EQ_RANGE,
  EQ_RULES,
  eqY,
  formatEqGain,
  presetMatching,
  presetNameMessage,
  renameEqPreset,
  sameGains,
  type EqPreset,
  updateEqPreset,
} from "../lib/eq";
import { useSettings } from "../stores/settings";
import { useUI, type MenuItem } from "../stores/ui";

type BoardProps = {
  gains: readonly number[];
  enabled: boolean;
  onBandChange: (index: number, gain: number) => void;
};

const BAND_INPUT =
  "h-full cursor-pointer appearance-none rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default [&::-webkit-slider-runnable-track]:w-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-wash [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full";

const CHIP =
  "inline-flex h-10 items-center justify-center rounded-[12px] px-4 text-[13px] font-medium motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out disabled:cursor-default disabled:hover:bg-wash";

function EqChip({ active, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  const tone = active ? "bg-accent text-on-accent" : "bg-wash text-ink-2 hover:bg-hover";
  return <button type="button" className={`${CHIP} ${tone} ${className}`} {...props} />;
}

export function EqBoard({ gains, enabled, onBandChange }: BoardProps) {
  return (
    <div>
      <div className="relative" style={{ height: EQ_H }}>
        {EQ_RULES.map((rule) => (
          <span
            key={rule}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 h-px ${rule === 0 ? "bg-ink-1/30" : "bg-ink-1/10"}`}
            style={{ top: eqY(rule) }}
          />
        ))}
        <div className="grid h-full grid-cols-10 gap-x-1">
          {EQ_BANDS_HZ.map((_, index) => {
            const gain = gains[index] ?? 0;
            return (
              <input
                key={EQ_BAND_LABELS[index]}
                type="range"
                min={-EQ_RANGE}
                max={EQ_RANGE}
                step={1}
                value={gain}
                aria-label={`${EQ_BAND_LABELS[index]} Hz`}
                aria-valuetext={formatEqGain(gain)}
                onChange={(event) => onBandChange(index, Number(event.target.value))}
                onDoubleClick={() => onBandChange(index, 0)}
                className={`${BAND_INPUT} ${enabled ? "[&::-webkit-slider-thumb]:bg-ink-1" : "[&::-webkit-slider-thumb]:bg-ink-2"}`}
                style={{ writingMode: "vertical-lr", direction: "rtl", width: EQ_BAND_HIT, justifySelf: "center" }}
              />
            );
          })}
        </div>
      </div>
      <div className={`mt-2 grid grid-cols-10 gap-x-1 text-center text-[11.5px] tabular-nums ${enabled ? "text-ink-1" : "text-ink-2"}`}>
        {EQ_BANDS_HZ.map((_, index) => (
          <span key={EQ_BAND_LABELS[index]}>{formatEqGain(gains[index] ?? 0)}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-10 gap-x-1 text-center text-[11px] text-ink-2">
        {EQ_BAND_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function validName(raw: string, current?: string): string | null {
  const presets = useSettings.getState().eqPresets;
  const checked = checkPresetName(raw, presets, current);
  if (checked.name !== undefined) return checked.name;
  useUI.getState().toast(presetNameMessage(checked.error, cleanPresetName(raw)), "error");
  return null;
}

function openSave() {
  useUI.getState().openDialog({
    title: "Save preset",
    placeholder: "Preset name",
    initialValue: "My preset",
    confirmLabel: "Save",
    onConfirm: (value) => {
      const name = validName(value);
      if (name === null) return;
      const { eqPresets, eqGains, setValue } = useSettings.getState();
      setValue("eqPresets", addEqPreset(eqPresets, name, eqGains));
    },
  });
}

function openRename(from: string) {
  useUI.getState().openDialog({
    title: "Rename preset",
    placeholder: "Preset name",
    initialValue: from,
    confirmLabel: "Rename",
    onConfirm: (value) => {
      const name = validName(value, from);
      if (name === null) return;
      const { eqPresets, setValue } = useSettings.getState();
      setValue("eqPresets", renameEqPreset(eqPresets, from, name));
    },
  });
}

function presetMenu(preset: EqPreset): MenuItem[] {
  const { eqGains, eqPresets, setValue } = useSettings.getState();
  return [
    { label: "Rename", onSelect: () => openRename(preset.name) },
    {
      label: "Update to current curve",
      disabled: sameGains(preset.gains, eqGains),
      onSelect: () => setValue("eqPresets", updateEqPreset(eqPresets, preset.name, eqGains)),
    },
    {
      label: "Delete",
      danger: true,
      separatorBefore: true,
      onSelect: () => setValue("eqPresets", deleteEqPreset(eqPresets, preset.name)),
    },
  ];
}

export function Equalizer() {
  const enabled = useSettings((state) => state.eqEnabled);
  const gains = useSettings((state) => state.eqGains);
  const presets = useSettings((state) => state.eqPresets);
  const setEqGains = useSettings((state) => state.setEqGains);
  const matched = presetMatching(gains, presets);

  function changeBand(index: number, gain: number) {
    const next = [...gains];
    next[index] = clampEqGain(gain);
    setEqGains(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <EqBoard gains={gains} enabled={enabled} onBandChange={changeBand} />
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(EQ_PRESETS).map((name) => (
          <EqChip key={name} aria-pressed={matched === name} active={matched === name} onClick={() => setEqGains([...EQ_PRESETS[name]])}>
            {name}
          </EqChip>
        ))}
        {presets.map((preset) => (
          <EqChip
            key={preset.name}
            aria-pressed={matched === preset.name}
            active={matched === preset.name}
            title="Right-click to rename, update or delete"
            onClick={() => setEqGains([...preset.gains])}
            onContextMenu={(event) => openMenuAtPointer(event, () => presetMenu(preset))}
            onKeyDown={(event) => {
              openMenuFromKey(event, () => presetMenu(preset));
            }}
          >
            {preset.name}
          </EqChip>
        ))}
        <EqChip disabled={!enabled || matched !== null} onClick={openSave}>
          Save as preset
        </EqChip>
      </div>
    </div>
  );
}
