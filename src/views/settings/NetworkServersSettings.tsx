import { t } from "../../lib/i18n";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowsClockwise, Trash, LinkSimple } from "@phosphor-icons/react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { RadioGroup, type RadioOption } from "../../components/RadioGroup";
import { platform, type NetworkServer, type NetworkServerInput, type NetworkServerKind } from "../../lib/bridge";
import { deviceNoun } from "../../lib/desktopPlatform";
import { isPlainHttp, validateMusicServer } from "../../lib/musicServer";
import { useNavigation } from "../../stores/navigation";
import { useNetwork } from "../../stores/network";
import { PageHeader } from "./SettingsLayout";

function kindOptions(): RadioOption<NetworkServerKind>[] {
  return [
    { value: "webDav", label: t("network.kind.webDav") },
    { value: "smb", label: t("network.kind.smb") },
    { value: "subsonic", label: t("network.kind.subsonic") },
  ];
}

const EMPTY: NetworkServerInput = {
  id: "",
  kind: "subsonic",
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

const ICON_BUTTON =
  "hit-area flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] [corner-shape:squircle] text-ink-2 motion-safe:transition-colors hover:bg-wash hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function addressOf(server: NetworkServer): string {
  if (server.kind === "webDav" || server.kind === "subsonic") return server.url;
  return `\\\\${server.host}\\${server.share}${server.path ? `\\${server.path}` : ""}`;
}

function statusOf(server: NetworkServer): string {
  if (server.scanning) return t("network.scanning");
  if (server.scanError) return t("network.scanFailed", { error: server.scanError });
  return t("count.songs", { count: server.songCount });
}

export function NetworkServersSettings() {
  const navigate = useNavigation((state) => state.navigate);
  const servers = useNetwork((state) => state.servers);
  const busy = useNetwork((state) => state.busy);
  const load = useNetwork((state) => state.load);
  const save = useNetwork((state) => state.save);
  const remove = useNetwork((state) => state.remove);
  const refresh = useNetwork((state) => state.refresh);
  const test = useNetwork((state) => state.test);
  const [draft, setDraft] = useState<NetworkServerInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const anyScanning = servers.some((server) => server.scanning);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!anyScanning) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [anyScanning, load]);

  const open = () => {
    setDraft(EMPTY);
    setFormError(null);
    setResult(null);
  };

  const close = () => {
    setDraft(null);
    setFormError(null);
    setResult(null);
  };

  const check = (value: NetworkServerInput): string | null => {
    if (value.kind === "subsonic") {
      const key = validateMusicServer(value);
      return key ? t(key) : null;
    }
    return value.name.trim() ? null : t("network.error.name");
  };

  const submit = async () => {
    if (!draft) return;
    const problem = check(draft);
    setFormError(problem);
    if (problem) return;
    const saved = await save({ ...draft, name: draft.name.trim() });
    if (saved) close();
  };

  const runTest = async () => {
    if (!draft) return;
    const problem = validateMusicServer(draft);
    if (problem) {
      setResult({ ok: false, message: t(problem) });
      return;
    }
    setTesting(true);
    const outcome = await test(draft);
    setResult(outcome.ok ? { ok: true, message: outcome.message } : { ok: false, message: t("network.test.failed", { message: outcome.message }) });
    setTesting(false);
  };

  const field = (label: string, input: ReactNode) => (
    <label className="block text-meta text-ink-2">
      {label}
      {input}
    </label>
  );

  return (
    <div className="max-w-[680px] pb-8">
      <PageHeader
        title={t("network.title")}
        onBack={() => navigate({ name: "settings", param: "library" })}
      />

      <div className="space-y-6">
        {servers.length === 0 ? (
          <p className="text-body text-ink-2">{t("network.empty")}</p>
        ) : (
          <ul className="divide-y divide-separator rounded-[12px] bg-ink-1/[0.04] px-4">
            {servers.map((server) => (
              <li key={server.id} className="flex min-h-[52px] items-center gap-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink-1">{server.name}</span>
                  <span className="block truncate text-meta text-ink-2">{addressOf(server)}</span>
                  {server.kind === "subsonic" && <span className="block truncate text-meta text-ink-2">{statusOf(server)}</span>}
                </span>
                <span className="shrink-0 text-meta tabular-nums text-ink-2">{server.kindLabel}</span>
                {server.kind === "subsonic" && (
                  <button
                    type="button"
                    aria-label={t("network.refreshAria", { name: server.name })}
                    title={t("network.refresh")}
                    disabled={server.scanning}
                    onClick={() => void refresh(server.id)}
                    className={ICON_BUTTON}
                  >
                    <Icon icon={ArrowsClockwise} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t("network.removeAria", { name: server.name })}
                  onClick={() => void remove(server.id)}
                  className={ICON_BUTTON}
                >
                  <Icon icon={Trash} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {draft && (
          <section>
            <div className="space-y-3">
              <RadioGroup
                label={t("network.kind.label")}
                options={kindOptions()}
                value={draft.kind}
                onChange={(kind) => {
                  setDraft({ ...draft, kind });
                  setFormError(null);
                  setResult(null);
                }}
              />
              {draft.kind === "webDav" && field(t("network.address"), <input type="url" value={draft.url} placeholder="https://box.example/dav" onChange={(event) => setDraft({ ...draft, url: event.target.value })} className={FIELD} />)}
              {draft.kind === "smb" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {field("Host", <input type="text" value={draft.host} placeholder="192.168.1.10" onChange={(event) => setDraft({ ...draft, host: event.target.value })} className={FIELD} />)}
                  {field("Share", <input type="text" value={draft.share} placeholder="music" onChange={(event) => setDraft({ ...draft, share: event.target.value })} className={FIELD} />)}
                  {field("Folder", <input type="text" value={draft.path} placeholder="Albums" onChange={(event) => setDraft({ ...draft, path: event.target.value })} className={FIELD} />)}
                </div>
              )}
              {draft.kind === "subsonic" && (
                <>
                  {field(t("network.address"), <input type="text" inputMode="url" value={draft.url} placeholder="https://music.example" onChange={(event) => { setDraft({ ...draft, url: event.target.value }); setResult(null); }} className={FIELD} />)}
                  {isPlainHttp(draft.url) && <p className="text-meta text-ink-2">{t("network.httpNotice")}</p>}
                </>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {field(t("network.username"), <input type="text" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} className={FIELD} />)}
                {field(t("network.password"), <input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} className={FIELD} />)}
              </div>
              {field(
                draft.kind === "subsonic" ? t("network.nameOptional") : t("network.name"),
                <input type="text" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={FIELD} />,
              )}
              {formError && <p role="alert" className="text-meta text-danger-text">{formError}</p>}
              {result && (
                <p role="status" className={`text-meta ${result.ok ? "text-ink-1" : "text-danger-text"}`}>
                  {result.message}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button variant="primary" disabled={busy} onClick={() => void submit()}>
                  {t("dialog.save")}
                </Button>
                {draft.kind === "subsonic" && (
                  <Button disabled={testing} onClick={() => void runTest()}>
                    {testing ? t("network.testing") : t("network.test")}
                  </Button>
                )}
                <Button onClick={close}>{t("dialog.cancel")}</Button>
              </div>
            </div>
          </section>
        )}

        {!draft && (
          <div>
            <Button onClick={open} className="gap-2">
              <Icon icon={LinkSimple} />
              {t("network.add")}
            </Button>
          </div>
        )}
        <p className="text-meta text-ink-2">{t("network.note", { device: deviceNoun(platform) })}</p>
      </div>
    </div>
  );
}
