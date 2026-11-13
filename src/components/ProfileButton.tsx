import { useId } from "react";
import {
  ArrowReloadHorizontalIcon,
  Clock01Icon,
  Login01Icon,
  Logout01Icon,
  Settings02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import type { GoogleAccount } from "../lib/bridge";
import { useAuth } from "../stores/auth";
import { useNavigation } from "../stores/navigation";
import { useUI, type MenuItem } from "../stores/ui";

export function profileMenuItems(account: GoogleAccount): MenuItem[] {
  const navigate = useNavigation.getState().navigate;
  const signedIn = account.mode === "google";
  const auth: MenuItem = signedIn
    ? { label: "Sign out", icon: Logout01Icon, onSelect: () => useAuth.getState().requestSignOut() }
    : { label: "Sign in", icon: Login01Icon, onSelect: () => void useAuth.getState().signIn() };
  return [
    {
      label: "Account",
      icon: UserIcon,
      trailing: signedIn ? (account.name ?? account.email ?? "Google account") : undefined,
      onSelect: () => navigate({ name: "settings", param: "account" }),
    },
    { label: "Recents", icon: Clock01Icon, onSelect: () => navigate({ name: "search" }) },
    {
      label: "Sync",
      icon: ArrowReloadHorizontalIcon,
      trailing: signedIn ? "On" : "Off",
      onSelect: () => navigate({ name: "settings", param: "account" }),
    },
    { label: "Settings", icon: Settings02Icon, onSelect: () => navigate({ name: "settings" }) },
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
        className="h-full w-full object-cover"
      />
    );
  }
  const letter = (account.name ?? account.email ?? "").trim().charAt(0).toUpperCase();
  return (
    <span className="grid h-full w-full place-items-center text-[15px] font-semibold leading-none text-ink-1">
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
        ui.openContextMenu(rect.right, rect.top, profileMenuItems(account), { owner, alignRight: true, attached: true });
      }}
      data-open={open ? "true" : undefined}
      className={`hit-area grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[12px] [corner-shape:squircle] lifted-hover motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${open ? "relative z-[110]" : ""}`}
    >
      <Avatar account={account} />
    </button>
  );
}
