import { useId } from "react";
import { Clock01Icon, Login01Icon, Logout01Icon, Settings02Icon, UserIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { THEME_CHOICES, themeChoice } from "./ThemeButton";
import type { GoogleAccount } from "../lib/bridge";
import { useAuth } from "../stores/auth";
import { useNavigation } from "../stores/navigation";
import { useSettings } from "../stores/settings";
import { useUI, type MenuItem } from "../stores/ui";

export function profileMenuItems(account: GoogleAccount): MenuItem[] {
  const navigate = useNavigation.getState().navigate;
  const theme = useSettings.getState().theme;
  const signedIn = account.mode === "google";
  const header = signedIn ? (account.name ?? account.email ?? "Google account") : "Not signed in";
  const auth: MenuItem = signedIn
    ? { label: "Sign out", icon: Logout01Icon, separatorBefore: true, onSelect: () => useAuth.getState().requestSignOut() }
    : { label: "Sign in", icon: Login01Icon, separatorBefore: true, onSelect: () => void useAuth.getState().signIn() };
  return [
    { label: header, header: true },
    { label: "Account", onSelect: () => navigate({ name: "settings", param: "account" }) },
    { label: "Settings", icon: Settings02Icon, onSelect: () => navigate({ name: "settings" }) },
    {
      label: "Theme",
      note: themeChoice(theme).label,
      icon: themeChoice(theme).icon,
      children: THEME_CHOICES.map((choice) => ({
        label: choice.label,
        icon: choice.icon,
        checked: theme === choice.mode,
        onSelect: () => useSettings.getState().setTheme(choice.mode),
      })),
    },
    { label: "Recents", icon: Clock01Icon, onSelect: () => navigate({ name: "library" }) },
    {
      label: "Sync status",
      note: signedIn ? "On" : "Off",
      onSelect: () => navigate({ name: "settings", param: "account" }),
    },
    auth,
  ];
}

function Avatar({ account }: { account: GoogleAccount }) {
  if (account.pictureUrl) {
    return (
      <img
        src={account.pictureUrl}
        alt=""
        referrerPolicy="no-referrer"
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }
  const letter = (account.name ?? account.email ?? "").trim().charAt(0).toUpperCase();
  return (
    <span className="grid h-8 w-8 place-items-center rounded-full bg-elevated text-[15px] font-semibold leading-none text-ink-1">
      {letter || <Icon icon={UserIcon} />}
    </span>
  );
}

export function ProfileButton() {
  const owner = useId();
  const account = useAuth((state) => state.account);
  const open = useUI((state) => state.contextMenu?.owner === owner);
  const label =
    account.mode === "google" ? `Profile menu: ${account.name ?? account.email ?? "Google account"}` : "Profile menu";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      onPointerDown={(event) => {
        if (open) event.stopPropagation();
      }}
      onClick={(event) => {
        const ui = useUI.getState();
        if (ui.contextMenu?.owner === owner) {
          ui.closeContextMenu();
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        ui.openContextMenu(rect.right, rect.bottom + 8, profileMenuItems(account), { owner, alignRight: true });
      }}
      className="hit-area grid h-10 w-10 shrink-0 place-items-center rounded-full bg-wash motion-safe:transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Avatar account={account} />
    </button>
  );
}
