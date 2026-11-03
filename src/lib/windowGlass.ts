import { setReduceTransparency } from "./bridge";
import { useSettings } from "../stores/settings";

export function startWindowGlass(): () => void {
  let sent: boolean | null = null;
  const send = (reduce: boolean) => {
    if (reduce === sent) return;
    sent = reduce;
    void setReduceTransparency(reduce).catch(() => {
      sent = null;
    });
  };

  send(useSettings.getState().reduceDynamicBlur);
  return useSettings.subscribe((state, previous) => {
    if (state.reduceDynamicBlur !== previous.reduceDynamicBlur) send(state.reduceDynamicBlur);
  });
}
