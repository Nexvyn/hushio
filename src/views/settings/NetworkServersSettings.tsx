import { t } from "../../lib/i18n";
import { useEffect, useState } from "react";
import { Trash, LinkSimple } from "@phosphor-icons/react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { RadioGroup, type RadioOption } from "../../components/RadioGroup";
import { platform, type NetworkServer, type NetworkServerInput, type NetworkServerKind } from "../../lib/bridge";
import { deviceNoun } from "../../lib/desktopPlatform";
import { useNavigation } from "../../stores/navigation";
import { useNetwork } from "../../stores/network";
import { useUI } from "../../stores/ui";
import { PageHeader } from "./SettingsLayout";

const KIND_OPTIONS: RadioOption<NetworkServerKind>[] = [
  { value: "webDav", label: "WebDAV" },
  { value: "smb", label: "SMB" },
];

const EMPTY: NetworkServerInput = {
  id: "",
  kind: "webDav",
  name: "",
  url: "",
  host: "",
  share: "",
  path: "",
  username: "",
  password: "",
};

const FIELD =
  "mt-1 h-10 w-full rounded-[12px] [corner-shape:squircle] border border-separator bg-surface px-3 text-base text-ink-1 placeholder:text-ink-2 focus-visible:border-focus focus-visible:outline-none md:text-body";

function addressOf(server: NetworkServer): string {
  return server.kind === "webDav"
    ? server.url
    : `\\\\${server.host}\\${server.share}${server.path ? `\\${server.path}` : ""}`;
}

export function NetworkServersSettings() {
  const navigate = useNavigation((state) => state.navigate);
  const servers = useNetwork((state) => state.servers);
  const busy = useNetwork((state) => state.busy);
  const load = useNetwork((state) => state.load);
  const save = useNetwork((state) => state.save);
  const remove = useNetwork((state) => state.remove);
  const [draft, setDraft] = useState<NetworkServerInput>(EMPTY);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setDraft(EMPTY);
    useUI.getState().openDialog({
      title: "Add a network server",
      body: `Give it a name and the address. The password stays on this ${deviceNoun(platform)}.`,
      initialValue: "",
      placeholder: "Server name",
      confirmLabel: "Add",
      validate: (value) => (value.trim() ? null : "Give the server a name."),
      onConfirm: (value) => {
        setDraft({ ...EMPTY, name: value.trim() });
      },
    });
  };

  const submit = async () => {
    if (!draft.name.trim()) return;
    const saved = await save(draft);
    if (saved) setDraft(EMPTY);
  };

  return (
    <div className="max-w-[680px] pb-8">
      <PageHeader
        title="Network folders"
        note={`Play the music on a WebDAV or SMB server. The password stays on this ${deviceNoun(platform)}.`}
        onBack={() => navigate({ name: "settings", param: "library" })}
      />

      <div className="space-y-7">
        {servers.length === 0 ? (
          <p className="text-body text-ink-2">No servers yet. Add a WebDAV or SMB server to play the music on it.</p>
        ) : (
          <ul className="divide-y divide-separator">
            {servers.map((server) => (
              <li key={server.id} className="flex min-h-[52px] items-center gap-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink-1">{server.name}</span>
                  <span className="block truncate text-meta text-ink-2">{addressOf(server)}</span>
                </span>
                <span className="shrink-0 text-meta tabular-nums text-ink-2">{server.kindLabel}</span>
                <button
                  type="button"
                  aria-label={`Remove ${server.name}`}
                  onClick={() => void remove(server.id)}
                  className="hit-area flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] [corner-shape:squircle] text-ink-2 motion-safe:transition-colors hover:bg-wash hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Icon icon={Trash} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {draft.name !== "" && (
          <section>
            <h2 className="mb-1 text-meta font-medium text-ink-2">{draft.name}</h2>
            <div className="space-y-3">
              <RadioGroup
                label="Server type"
                options={KIND_OPTIONS}
                value={draft.kind}
                onChange={(kind) => setDraft({ ...draft, kind })}
              />
              {draft.kind === "webDav" ? (
                <label className="block text-meta text-ink-2">
                  Address
                  <input
                    type="url"
                    value={draft.url}
                    placeholder="https://box.example/dav"
                    onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                    className={FIELD}
                  />
                </label>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-meta text-ink-2">
                    Host
                    <input
                      type="text"
                      value={draft.host}
                      placeholder="192.168.1.10"
                      onChange={(event) => setDraft({ ...draft, host: event.target.value })}
                      className={FIELD}
                    />
                  </label>
                  <label className="block text-meta text-ink-2">
                    Share
                    <input
                      type="text"
                      value={draft.share}
                      placeholder="music"
                      onChange={(event) => setDraft({ ...draft, share: event.target.value })}
                      className={FIELD}
                    />
                  </label>
                  <label className="block text-meta text-ink-2">
                    Folder
                    <input
                      type="text"
                      value={draft.path}
                      placeholder="Albums"
                      onChange={(event) => setDraft({ ...draft, path: event.target.value })}
                      className={FIELD}
                    />
                  </label>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-meta text-ink-2">
                  User name
                  <input
                    type="text"
                    value={draft.username}
                    onChange={(event) => setDraft({ ...draft, username: event.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="block text-meta text-ink-2">
                  Password
                  <input
                    type="password"
                    value={draft.password}
                    onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                    className={FIELD}
                  />
                </label>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button variant="primary" disabled={busy} onClick={() => void submit()}>
                  Save
                </Button>
                <Button onClick={() => setDraft(EMPTY)}>{t("dialog.cancel")}</Button>
              </div>
            </div>
          </section>
        )}

        <div>
          <Button onClick={startNew} className="gap-2">
            <Icon icon={LinkSimple} />
            Add a server
          </Button>
        </div>
      </div>
    </div>
  );
}
