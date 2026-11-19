import { CaretDown, CaretUp, Trash, Plus, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { APP_NAME } from "../../lib/app";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Switch } from "../../components/Switch";
import { PhoneIcon } from "../../components/phone/PhoneIcon";
import { fetchManifest, testAddon } from "../../lib/addons/client";
import {
  addAddonSource,
  moveAddonSource,
  normalizeAddonUrl,
  removeAddonSource,
  setAddonEnabled,
  setAddonHealth,
  sortedAddons,
  sourceFromManifest,
} from "../../lib/addons/registry";
import type { AddonSource } from "../../lib/addons/types";
import { usePhone } from "../../lib/usePhone";
import { useNavigation } from "../../stores/navigation";
import { useSettings } from "../../stores/settings";
import { useUI } from "../../stores/ui";
import { PageHeader } from "./SettingsLayout";

const WARNING = `Add-ons are run by people outside ${APP_NAME}. The add-on's server sees each song you play and your IP address. ${APP_NAME} does not check what an add-on sends, or whether it is allowed where you live. Only add an add-on you trust.`;

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong";
}

function Glyph({ icon }: { icon: PhosphorIcon }) {
  return usePhone() ? <PhoneIcon icon={icon} /> : <Icon icon={icon} />;
}

function IconButton({
  label,
  icon,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: PhosphorIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="hit-area flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] [corner-shape:squircle] text-ink-2 motion-safe:transition-colors hover:bg-wash hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40"
    >
      <Glyph icon={icon} />
    </button>
  );
}

function dotClass(source: AddonSource): string {
  const health = source.lastHealth;
  if (!health) return "bg-ink-2/40";
  return health.ok ? "bg-ink-1" : "bg-danger";
}

function statusText(source: AddonSource): string {
  const health = source.lastHealth;
  if (!health) return "Not tested yet";
  if (!health.ok) return health.error ?? "Not working";
  return `Working, ${health.latencyMs} ms`;
}

export function AddonSourcesSettings() {
  const navigate = useNavigation((state) => state.navigate);
  const sources = useSettings((state) => state.addonSources);
  const setValue = useSettings((state) => state.setValue);
  const ordered = sortedAddons(sources);

  const save = (next: AddonSource[]) => setValue("addonSources", next);

  const add = async (url: string) => {
    try {
      const manifest = await fetchManifest(url);
      const next = addAddonSource(useSettings.getState().addonSources, sourceFromManifest(url, manifest));
      save(next);
      useUI.getState().toast(`${manifest.name} added`);
    } catch (error) {
      useUI.getState().toast(messageOf(error), "error");
    }
  };

  const warn = (url: string) => {
    useUI.getState().openDialog({
      title: "Add this source?",
      body: WARNING,
      confirmLabel: "Add anyway",
      cancelLabel: "Cancel",
      onConfirm: () => {
        void add(url);
      },
    });
  };

  const startAdd = () => {
    useUI.getState().openDialog({
      title: "Add an add-on source",
      body: "Paste the add-on's address. It must start with https://",
      initialValue: "",
      placeholder: "https://addon.example",
      confirmLabel: "Continue",
      validate: (value) => {
        try {
          normalizeAddonUrl(value);
          return null;
        } catch (error) {
          return messageOf(error);
        }
      },
      onConfirm: (value) => {
        const url = normalizeAddonUrl(value);
        queueMicrotask(() => warn(url));
      },
    });
  };

  const test = async (source: AddonSource) => {
    const health = await testAddon(source);
    save(setAddonHealth(useSettings.getState().addonSources, source.id, health));
  };

  const remove = (source: AddonSource) => {
    useUI.getState().openDialog({
      title: `Remove ${source.name}?`,
      body: "Hushio stops using this add-on. You can add it again later.",
      confirmLabel: "Remove",
      cancelLabel: "Cancel",
      danger: true,
      onConfirm: () => {
        save(removeAddonSource(useSettings.getState().addonSources, source.id));
      },
    });
  };

  return (
    <div className="max-w-[680px] pb-8">
      <PageHeader
        title="Add-on sources"
        note="Add-ons can supply lossless (FLAC) audio when streaming quality is Lossless. Hushio tries them in order and falls back to the normal source."
        onBack={() => navigate({ name: "settings", param: "library" })}
      />

      <div className="space-y-5">
        {ordered.length === 0 ? (
          <p className="text-body text-ink-2">No add-ons yet. Add one to get lossless audio when it is available.</p>
        ) : (
          <ul className="divide-y divide-separator">
            {ordered.map((source, index) => (
              <li key={source.id} className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-2 py-2">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${dotClass(source)}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium text-ink-1">{source.name}</span>
                    <span
                      className={`block truncate text-meta ${source.lastHealth && !source.lastHealth.ok ? "text-danger-text" : "text-ink-2"}`}
                    >
                      {statusText(source)}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Switch
                    aria-label={`Use ${source.name}`}
                    checked={source.enabled}
                    onCheckedChange={(checked) => save(setAddonEnabled(useSettings.getState().addonSources, source.id, checked))}
                  />
                  <IconButton
                    label={`Move ${source.name} up`}
                    icon={CaretUp}
                    disabled={index === 0}
                    onClick={() => save(moveAddonSource(useSettings.getState().addonSources, source.id, -1))}
                  />
                  <IconButton
                    label={`Move ${source.name} down`}
                    icon={CaretDown}
                    disabled={index === ordered.length - 1}
                    onClick={() => save(moveAddonSource(useSettings.getState().addonSources, source.id, 1))}
                  />
                  <Button onClick={() => void test(source)}>Test</Button>
                  <IconButton label={`Remove ${source.name}`} icon={Trash} onClick={() => remove(source)} />
                </span>
              </li>
            ))}
          </ul>
        )}

        <div>
          <Button onClick={startAdd} className="gap-2">
            <Glyph icon={Plus} />
            Add source
          </Button>
        </div>
      </div>
    </div>
  );
}
