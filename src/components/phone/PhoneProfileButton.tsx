import { UserIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../Icon";
import { useAuth } from "../../stores/auth";
import { useNavigation } from "../../stores/navigation";

export function AccountAvatar({ size }: { size: number }) {
  const account = useAuth((state) => state.account);
  const picture = account.mode === "google" ? account.pictureUrl : null;
  if (picture) {
    return (
      <img
        src={picture}
        alt=""
        referrerPolicy="no-referrer"
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-wash text-ink-1"
    >
      <Icon icon={UserIcon} />
    </span>
  );
}

export function PhoneProfileButton() {
  const navigate = useNavigation((state) => state.navigate);
  return (
    <button
      type="button"
      aria-label="Profile and settings"
      title="Profile and settings"
      onClick={() => navigate({ name: "settings" })}
      className="grid size-11 shrink-0 place-items-center rounded-full motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <AccountAvatar size={32} />
    </button>
  );
}
