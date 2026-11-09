import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../components/Icon";
import { SettingRow } from "../components/SettingRow";
import { appVersion, platform } from "../lib/bridge";
import { shellFor, useViewportWidth } from "../lib/layoutTier";
import { useAuth } from "../stores/auth";
import { useSync } from "../stores/sync";
import { useUpdates } from "../stores/updates";
import { useNavigation } from "../stores/navigation";
import { useSettings } from "../stores/settings";
import {
  buildCategories,
  CATEGORY_IDS,
  type CategoryId,
  type SettingsCategory,
  type SettingsGroup,
} from "./settings/categories";
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

function GroupView({ group }: { group: SettingsGroup }) {
  return (
    <section className="mt-6 first:mt-0">
      {group.title && <h3 className="mb-1 px-1 text-[13px] font-semibold text-ink-2">{group.title}</h3>}
      {group.note && <p className="mb-2 px-1 text-[12.5px] text-ink-2">{group.note}</p>}
      <div className="divide-y divide-separator overflow-hidden rounded-[11px] border border-separator bg-panel">
        {group.rows.map((row) => (
          <SettingRow key={row.id} {...row} />
        ))}
        {group.body && <div className="px-4 py-4">{group.body}</div>}
      </div>
    </section>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onChange("");
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
        <Icon icon={Search01Icon} />
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
        className="h-9 w-full rounded-full border border-separator bg-surface pl-10 pr-10 text-[13px] text-ink-1 placeholder:text-ink-2"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="hit-area absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink-1"
        >
          <Icon icon={Cancel01Icon} />
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
    const button = buttons.current.get(active);
    if (button) setLight({ top: button.offsetTop, height: button.offsetHeight });
  }, [active]);

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
        className="pointer-events-none absolute inset-x-0 rounded-[9px] bg-ink-1/[0.08] motion-safe:transition-transform motion-safe:duration-swap motion-safe:ease-out"
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
            className={`relative flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left text-[14px] font-medium transition-colors ${
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

type PhoneSettingsProps = {
  categories: SettingsCategory[];
  results: SettingsCategory[];
  query: string;
  onQueryChange: (value: string) => void;
  open: SettingsCategory | undefined;
  onOpen: (id: CategoryId) => void;
  onBack: () => void;
};

function PhoneSettings({ categories, results, query, onQueryChange, open, onOpen, onBack }: PhoneSettingsProps) {
  const searching = query.trim() !== "";

  if (!searching && open) {
    return (
      <div key={open.id} className="settings-pane pb-6">
        <header className="flex items-start gap-1">
          <button
            type="button"
            aria-label="Back to settings"
            onClick={onBack}
            className="-ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink-1 motion-safe:transition-colors hover:bg-wash"
          >
            <Icon icon={ArrowLeft01Icon} />
          </button>
          <div className="min-w-0 pt-2">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink-1">{open.label}</h2>
            <p className="mt-1 text-[13px] text-ink-2">{open.lede}</p>
          </div>
        </header>
        <div className="mt-4">
          {open.groups.map((group, index) => (
            <GroupView key={group.title ?? index} group={group} />
          ))}
        </div>
      </div>
    );
  }

  const list = searching ? results : categories;

  return (
    <div className="pb-6">
      <h1 className="pt-1 text-[34px] font-extrabold tracking-[-0.03em] text-ink-1">Settings</h1>
      <div className="mt-4">
        <SearchBox value={query} onChange={onQueryChange} />
      </div>
      {searching && results.length === 0 && (
        <p className="px-1 pt-4 text-[13px] text-ink-2">No settings match “{query.trim()}”</p>
      )}
      {searching
        ? results.map((category) => (
            <section key={category.id} className="mt-6">
              <h2 className="mb-2 text-[17px] font-semibold text-ink-1">{category.label}</h2>
              {category.groups.map((group, index) => (
                <GroupView key={group.title ?? index} group={group} />
              ))}
            </section>
          ))
        : list.length > 0 && (
            <ul className="mt-4 divide-y divide-separator overflow-hidden rounded-[11px] border border-separator bg-panel">
              {list.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    data-cat={category.id}
                    onClick={() => onOpen(category.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-[14px] font-medium text-ink-1 motion-safe:transition-colors active:bg-wash"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-wash text-ink-2">
                      <Icon icon={category.icon} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{category.label}</span>
                    <span className="shrink-0 text-ink-2">
                      <Icon icon={ArrowRight01Icon} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
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
  const driveStatus = useSync((state) => state.drive);
  const tvConnected = useSync((state) => state.tvConnected);
  const tvCode = useSync((state) => state.tvCode);
  const tvBusy = useSync((state) => state.tvBusy);
  const tvError = useSync((state) => state.tvError);
  const [query, setQuery] = useState("");
  const viewportWidth = useViewportWidth();

  const active = resolveCategory(view.param);
  const categories = buildCategories({
    settings,
    version,
    platform,
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
      drive: driveStatus,
      syncNow: () => {
        void useSync.getState().syncNow();
        void useSync.getState().syncDriveNow();
      },
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
  });
  const searching = query.trim() !== "";
  const results = filterCategories(categories, query);
  const current = categories.find((category) => category.id === active);
  const phone = platform === "android" && shellFor(viewportWidth) === "phone";

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
        onOpen={(id) => navigate({ name: "settings", param: id })}
        onBack={backToSettingsList}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] gap-8">
      <aside className="flex w-[220px] shrink-0 flex-col gap-4">
        <h1 className="text-[34px] font-extrabold tracking-[-0.03em] text-ink-1">Settings</h1>
        <SearchBox value={query} onChange={setQuery} />
        <CategoryNav categories={categories} active={active} onSelect={select} />
      </aside>

      <div className="min-w-0 flex-1 pt-2">
        {searching ? (
          results.length > 0 ? (
            results.map((category) => (
              <section key={category.id} className="mb-10">
                <h2 className="text-[17px] font-semibold text-ink-1">{category.label}</h2>
                <div className="mt-3">
                  {category.groups.map((group, index) => (
                    <GroupView key={group.title ?? index} group={group} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <p className="px-1 pt-2 text-[13px] text-ink-2">No settings match “{query.trim()}”</p>
          )
        ) : (
          current && (
            <div key={current.id}>
              <header>
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink-1">{current.label}</h2>
                <p className="mt-1 text-[13px] text-ink-2">{current.lede}</p>
              </header>
              <div className="mt-5">
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
