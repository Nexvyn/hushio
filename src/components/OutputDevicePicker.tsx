import { useEffect, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { deviceChoices, listOutputDevices, type OutputDevice, readOutputDevices } from "../lib/outputDevices";
import { useSettings } from "../stores/settings";
import { useUI, type MenuItem } from "../stores/ui";

function choiceMenu(devices: readonly OutputDevice[], sink: string, pin: (deviceId: string) => void): MenuItem[] {
  const choices = deviceChoices(devices);
  const active = choices.find((choice) => !choice.isDefault && choice.activeDefault)?.label;
  return choices.map((choice) => ({
    label: choice.label,
    note: choice.isDefault ? active : undefined,
    checked: choice.isDefault ? sink === "" : choice.deviceId === sink,
    onSelect: () => pin(choice.deviceId),
  }));
}

export function OutputDevicePicker() {
  const sink = useSettings((state) => state.audioSinkId);
  const setAudioSinkId = useSettings((state) => state.setAudioSinkId);
  const [devices, setDevices] = useState<OutputDevice[]>([]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const media = navigator.mediaDevices;
    let live = true;
    const refresh = () => {
      void readOutputDevices().then((next) => {
        if (live) setDevices(next);
      });
    };
    refresh();
    media.addEventListener("devicechange", refresh);
    return () => {
      live = false;
      media.removeEventListener("devicechange", refresh);
    };
  }, []);

  const pinned = sink === "" ? undefined : devices.find((device) => device.deviceId === sink);
  const label = pinned?.label ?? "System default";

  function open(anchor: DOMRect) {
    void listOutputDevices().then((next) => {
      setDevices(next);
      useUI
        .getState()
        .openContextMenu(anchor.right, anchor.bottom + 6, choiceMenu(next, useSettings.getState().audioSinkId, setAudioSinkId), {
          alignRight: true,
        });
    });
  }

  return (
    <Button aria-haspopup="menu" onClick={(event) => open(event.currentTarget.getBoundingClientRect())} className="gap-1.5">
      {label}
      <Icon icon={ArrowDown01Icon} />
    </Button>
  );
}
