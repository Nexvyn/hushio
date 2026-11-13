import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { useArtworkPalette } from "../lib/artworkPalette";
import { upgradeArtwork } from "../lib/artwork";
import { isTabRoot, tabRootFor } from "../lib/phoneNav";
import { usePhone } from "../lib/usePhone";
import { useNavigation } from "../stores/navigation";
import { AmbientBackdrop, PALETTE_ART } from "./AmbientBackdrop";
import { PhoneHeader } from "./phone/PhoneHeader";

export type PageHeaderProps = {
  title: string;
  meta?: ReactNode;
  artwork?: string | null;
  actions?: ReactNode;
  titleId?: string;
  titleTooltip?: string;
  ambient?: boolean;
  icon?: IconSvgElement;
  onBack?: () => void;
};

export function monogram(title: string): string {
  return title.trim().charAt(0).toUpperCase();
}

function Artwork({ src, title }: { src: string | null; title: string }) {
  if (src) {
    return <img src={src} alt="" className="h-40 w-40 shrink-0 rounded-art object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      data-testid="page-monogram"
      className="grid h-40 w-40 shrink-0 place-items-center rounded-art bg-wash text-[56px] font-bold text-ink-2"
    >
      {monogram(title)}
    </span>
  );
}

function goBackOrTabRoot() {
  const nav = useNavigation.getState();
  if (nav.navPast.length > 0) nav.goBack();
  else nav.navigate(tabRootFor(nav.view));
}

export function PageHeader({ title, meta, artwork, actions, titleId, titleTooltip, ambient = false, icon, onBack }: PageHeaderProps) {
  const phone = usePhone();
  const view = useNavigation((state) => state.view);
  const cover = ambient && artwork ? upgradeArtwork(artwork, PALETTE_ART) : "";
  const palette = useArtworkPalette(cover);
  if (phone) {
    return (
      <PhoneHeader
        title={title}
        meta={meta}
        artwork={artwork}
        icon={icon}
        actions={actions}
        titleId={titleId}
        titleTooltip={titleTooltip}
        onBack={onBack ?? (isTabRoot(view) ? undefined : goBackOrTabRoot)}
      />
    );
  }
  const header = (
    <header className="flex min-w-0 items-end gap-5">
      {artwork !== undefined && <Artwork src={artwork} title={title} />}
      <div className="min-w-0 flex-1">
        <h1 id={titleId} title={titleTooltip} className="break-words text-page-title text-ink-1">
          {title}
        </h1>
        {meta && <div className="mt-1.5 text-meta tabular-nums text-ink-2">{meta}</div>}
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </header>
  );
  if (!cover) return header;
  return (
    <div className="relative -mx-10 -mt-5 flex flex-col overflow-hidden px-10 pb-7 pt-5">
      <AmbientBackdrop primary={palette.primary} src={cover} variant="header" />
      <div className="relative min-w-0">{header}</div>
    </div>
  );
}
