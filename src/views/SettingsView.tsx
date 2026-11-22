import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { CaretRight, X, DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { Icon } from "../components/Icon";
import { PhoneIcon } from "../components/phone/PhoneIcon";
import { SectionHeader } from "../components/SectionHeader";
import { appVersion, platform, type GoogleAccount } from "../lib/bridge";
import { usePhone } from "../lib/usePhone";
import { usesNativeAudio } from "../lib/nativeAudioDeck";
import { useAuth } from "../stores/auth";
import { useDiscord } from "../stores/discord";
import { useScrobble } from "../stores/scrobble";
import { useSync } from "../stores/sync";
import { useUpdates } from "../stores/updates";
import { useNavigation, type View } from "../stores/navigation";
import { useSettings } from "../stores/settings";
import {
  buildCategories,
  CATEGORY_IDS,
  type CategoryId,
  type SettingsCategory,
} from "./settings/categories";
import { PhoneHeader } from "../components/phone/PhoneHeader";
import { AccountAvatar } from "../components/phone/PhoneProfileButton";
import { GroupView, PageHeader } from "./settings/SettingsLayout";
import { HomeSectionsSettings } from "./settings/HomeSectionsSettings";
import { NetworkServersSettings } from "./settings/NetworkServersSettings";
import { AddonSourcesSettings } from "./settings/AddonSourcesSettings";
import { CrashLogs } from "./settings/CrashLogs";
import { filterCategories } from "./settings/search";

const STEP: Record<string, number> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };

function resolveCategory(param: string | undefined): CategoryId {
  return CATEGORY_IDS.find((id) => id === param) ?? "account";
}

function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    appVersion().then(
      (value) => {
        if (live) setVersion(value);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return version;
}

function SearchBox({ value, onChange, phone = false }: { value: string; onChange: (value: string) => void; phone?: boolean }) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onChange("");
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
        <Icon icon={MagnifyingGlass} />
      </span>
      <input
        id="settings-filter"
        type="text"
        aria-label="Search settings"
        placeholder="Search settings"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className={
          phone
            ? "h-11 w-full rounded-[12px] [corner-shape:squircle] bg-elevated pl-10 pr-10 text-base text-ink-1 placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            : "h-10 w-full rounded-[12px] [corner-shape:squircle] border border-separator bg-surface pl-10 pr-10 text-base text-ink-1 md:text-body placeholder:text-ink-2 focus-visible:border-focus focus-visible:outline-none"
        }
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="hit-area absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[12px] [corner-shape:squircle] text-ink-2 motion-safe:transition-colors hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Icon icon={X} />
        </button>
      )}
    </div>
  );
}

type CategoryNavProps = {
  categories: SettingsCategory[];
  active: CategoryId;
  onSelect: (id: CategoryId) => void;
};

function CategoryNav({ categories, active, onSelect }: CategoryNavProps) {
  const buttons = useRef(new Map<CategoryId, HTMLButtonElement>());
  const [light, setLight] = useState({ top: 0, height: 0 });

  useLayoutEffect(() => {
    function measure() {
      const button = buttons.current.get(active);
      if (!button) return;
      const top = button.offsetTop;
      const height = button.offsetHeight;
      setLight((previous) =>
        previous.top === top && previous.height === height ? previous : { top, height },
      );
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, categories]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = categories[Math.min(categories.length - 1, Math.max(0, index + step))];
    onSelect(next.id);
    buttons.current.get(next.id)?.focus();
  }

  return (
    <nav aria-label="Settings categories" className="relative flex flex-col gap-0.5">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 rounded-[12px] [corner-shape:squircle] bg-ink-1/[0.08] motion-safe:transition-transform motion-safe:duration-swap motion-safe:ease-out"
        style={{ transform: `translateY(${light.top}px)`, height: light.height }}
      />
      {categories.map((category, index) => {
        const current = category.id === active;
        return (
          <button
            key={category.id}
            ref={(element) => {
              if (element) buttons.current.set(category.id, element);
              else buttons.current.delete(category.id);
            }}
            type="button"
            data-cat={category.id}
            aria-current={current ? "page" : undefined}
            onClick={() => onSelect(category.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`relative flex w-full items-center gap-3 rounded-[12px] [corner-shape:squircle] px-3 py-2.5 text-left text-body font-medium motion-safe:transition-colors ${
              current ? "text-ink-1" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            <Icon icon={category.icon} />
            {category.label}
          </button>
        );
      })}
    </nav>
  );
}

const PHONE_GROUPS: CategoryId[][] = [
  ["playback", "sound", "lyrics"],
  ["display", "library"],
  ["scrobbling", "data"],
  ["about"],
];

const PHONE_BOX = "divide-y divide-separator rounded-[12px] [corner-shape:squircle] bg-elevated px-4";
const PHONE_ROW = "-mx-4 flex w-[calc(100%+2rem)] items-center gap-4 px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function backOr(fallback: View) {
  const nav = useNavigation.getState();
  if (nav.navPast.length > 0) nav.goBack();
  else nav.navigate(fallback);
}

type PhoneSettingsProps = {
  categories: SettingsCategory[];
  results: SettingsCategory[];
  query: string;
  onQueryChange: (value: string) => void;
  open: SettingsCategory | undefined;
  account: GoogleAccount;
  onOpen: (id: CategoryId) => void;
  onDownloads: () => void;
  onBack: () => void;
};

function PhoneSettings({
  categories,
  results,
  query,
  onQueryChange,
  open,
  account,
  onOpen,
  onDownloads,
  onBack,
}: PhoneSettingsProps) {
  const searching = query.trim() !== "";

  if (!searching && open) {
    return (
      <div key={open.id} className="settings-pane pb-6">
        <PhoneHeader title={open.label} onBack={onBack} backLabel="Back to settings" />
        {open.groups.map((group, index) => (
          <GroupView key={group.title ?? index} group={group} phone />
        ))}
      </div>
    );
  }

  const signedIn = account.mode === "google";
  const name = signedIn ? (account.name ?? account.email ?? "Google account") : "Not signed in";
  const groups = PHONE_GROUPS.map((ids) =>
    ids.flatMap((id) => categories.filter((category) => category.id === id)),
  ).filter((items) => items.length > 0);

  return (
    <div className="pb-6">
      <PhoneHeader title="Settings" onBack={() => backOr({ name: "home" })} />
      <div className="mb-6">
        <SearchBox value={query} onChange={onQueryChange} phone />
      </div>
      {searching && results.length === 0 && (
        <p className="pt-4 text-body text-ink-2">No settings match “{query.trim()}”</p>
      )}
      {searching ? (
        results.map((category) => (
          <section key={category.id} className="mt-7 first:mt-0">
            <SectionHeader title={category.label} />
            <div className="space-y-5">
              {category.groups.map((group, index) => (
                <GroupView key={group.title ?? index} group={group} phone />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="space-y-6">
          <div className={PHONE_BOX}>
            <button type="button" onClick={() => onOpen("account")} className={`${PHONE_ROW} h-[64px]`}>
              <span className="grid w-8 shrink-0 place-items-center">
                <AccountAvatar size={32} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-title text-card-title font-semibold leading-[22px] tracking-[-0.02em] text-ink-1">{name}</span>
                <span className="block truncate text-meta leading-[18px] text-ink-2">
                  {signedIn ? "Signed in with Google" : "Sign in to sync playlists and likes"}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-ink-2">
                <Icon icon={CaretRight} />
              </span>
            </button>
            <button type="button" onClick={onDownloads} className={`${PHONE_ROW} h-[52px]`}>
              <span className="grid w-8 shrink-0 place-items-center text-ink-1">
                <PhoneIcon icon={DownloadSimple} />
              </span>
              <span className="min-w-0 flex-1 truncate text-body leading-[22px] text-ink-1">Downloads</span>
              <span aria-hidden="true" className="shrink-0 text-ink-2">
                <Icon icon={CaretRight} />
              </span>
            </button>
          </div>
          {groups.map((items) => (
            <ul key={items[0].id} className={PHONE_BOX}>
              {items.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    data-cat={category.id}
                    onClick={() => onOpen(category.id)}
                    className={`${PHONE_ROW} h-[52px] motion-safe:transition-opacity active:opacity-70`}
                  >
                    <span className="grid w-8 shrink-0 place-items-center text-ink-1">
                      <PhoneIcon icon={category.icon} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body leading-[22px] text-ink-1">{category.label}</span>
                    <span aria-hidden="true" className="shrink-0 text-ink-2">
                      <Icon icon={CaretRight} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </div>
      )}
    </div>
  );
}

function backToSettingsList(): void {
  const nav = useNavigation.getState();
  const previous = nav.navPast.at(-1);
  if (previous?.view.name === "settings" && previous.view.param === undefined) nav.goBack();
  else nav.replaceView({ name: "settings" });
}

export function SettingsView() {
  const view = useNavigation((state) => state.view);
  const replaceView = useNavigation((state) => state.replaceView);
  const navigate = useNavigation((state) => state.navigate);
  const settings = useSettings();
  const version = useAppVersion();
  const updateState = useUpdates((store) => store.state);
  const account = useAuth((state) => state.account);
  const signingIn = useAuth((state) => state.signingIn);
  const syncStatus = useSync((state) => state.status);
  const tvConnected = useSync((state) => state.tvConnected);
  const tvCode = useSync((state) => state.tvCode);
  const tvBusy = useSync((state) => state.tvBusy);
  const tvError = useSync((state) => state.tvError);
  const scrobbleStatus = useScrobble((state) => state.status);
  const scrobbleBusy = useScrobble((state) => state.busy);
  const discordStatus = useDiscord((state) => state.status);
  const [query, setQuery] = useState("");

  const active = resolveCategory(view.param);
  const loadScrobble = useScrobble((state) => state.load);
  const loadDiscord = useDiscord((state) => state.load);

  useEffect(() => {
    void loadScrobble();
    void loadDiscord();
  }, [loadScrobble, loadDiscord]);

  const categories = buildCategories({
    settings,
    version,
    platform,
    nativeAudio: usesNativeAudio,
    navigate,
    updates: {
      state: updateState,
      check: () => void useUpdates.getState().check(),
      install: () => void useUpdates.getState().install(),
      restart: () => void useUpdates.getState().restart(),
      openPage: (url: string) => useUpdates.getState().openPage(url),
    },
    auth: {
      account,
      signingIn,
      signIn: () => void useAuth.getState().signIn(),
      cancelSignIn: () => void useAuth.getState().cancelSignIn(),
      requestSignOut: () => useAuth.getState().requestSignOut(),
    },
    sync: {
      status: syncStatus,
      syncNow: () => void useSync.getState().syncNow(),
      tv: {
        connected: tvConnected,
        code: tvCode,
        busy: tvBusy,
        error: tvError,
        connect: () => void useSync.getState().connectTv(),
        cancel: () => void useSync.getState().cancelTv(),
        open: () => void useSync.getState().openTv(),
        disconnect: () => void useSync.getState().disconnectTv(),
      },
    },
    scrobble: {
      status: scrobbleStatus,
      busy: scrobbleBusy,
      setEnabled: (service, enabled) => void useScrobble.getState().setEnabled(service, enabled),
      connectListenbrainz: (token) => void useScrobble.getState().connectListenbrainz(token),
      disconnectListenbrainz: () => void useScrobble.getState().disconnectListenbrainz(),
      beginLastfm: () => void useScrobble.getState().beginLastfm(),
      finishLastfm: () => void useScrobble.getState().finishLastfm(),
      disconnectLastfm: () => void useScrobble.getState().disconnectLastfm(),
    },
    discord: {
      status: discordStatus,
      setEnabled: (enabled) => void useDiscord.getState().setEnabled(enabled),
    },
  });
  const searching = query.trim() !== "";
  const results = filterCategories(categories, query);
  const current = categories.find((category) => category.id === active);
  const phone = usePhone();

  if (view.param === "home-sections") {
    return <HomeSectionsSettings />;
  }

  if (view.param === "crash-logs") {
    return <CrashLogs />;
  }

  if (view.param === "network-servers") {
    return <NetworkServersSettings />;
  }

  if (view.param === "add-on-sources") {
    return <AddonSourcesSettings />;
  }

  function select(id: CategoryId) {
    replaceView({ name: "settings", param: id });
  }

  if (phone) {
    return (
      <PhoneSettings
        categories={categories}
        results={results}
        query={query}
        onQueryChange={setQuery}
        open={categories.find((category) => category.id === view.param)}
        account={account}
        onOpen={(id) => navigate({ name: "settings", param: id })}
        onDownloads={() => navigate({ name: "downloads" })}
        onBack={backToSettingsList}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] gap-8">
      <aside className="sticky top-0 flex w-[220px] shrink-0 flex-col gap-3 self-start">
        <SearchBox value={query} onChange={setQuery} />
        <CategoryNav categories={categories} active={active} onSelect={select} />
      </aside>

      <div className="min-w-0 max-w-[680px] flex-1">
        {searching ? (
          results.length > 0 ? (
            <div className="space-y-10">
              {results.map((category) => (
                <section key={category.id}>
                  <SectionHeader title={category.label} />
                  <div className="space-y-10">
                    {category.groups.map((group, index) => (
                      <GroupView key={group.title ?? index} group={group} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="pt-2 text-body text-ink-2">No settings match “{query.trim()}”</p>
          )
        ) : (
          current && (
            <div key={current.id} className="animate-fade-in">
              <PageHeader title={current.label} />
              <div className="space-y-10">
                {current.groups.map((group, index) => (
                  <GroupView key={group.title ?? index} group={group} />
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
