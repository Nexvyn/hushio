import type { ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { isTabRoot, tabRoot } from "../lib/phoneNav";
import { usePhone } from "../lib/usePhone";
import { useNavigation } from "../stores/navigation";
import { Icon } from "./Icon";
import { PhoneHeader } from "./phone/PhoneHeader";

export type HeroTile = { icon: PhosphorIcon; accent?: boolean };

export type PageHeaderProps = {
  title: string;
  meta?: ReactNode;
  artwork?: string | null;
  actions?: ReactNode;
  titleId?: string;
  titleTooltip?: string;
  icon?: PhosphorIcon;
  tile?: HeroTile;
  onBack?: () => void;
  eyebrow?: string;
  footer?: ReactNode;
  description?: string;
  onEdit?: () => void;
  sharedArtworkId?: string;
};

export function monogram(title: string): string {
  return title.trim().charAt(0).toUpperCase();
}

function collectionTitleSize(title: string): number {
  const length = title.trim().length;
  if (length <= 12) return 96;
  if (length <= 22) return 72;
  if (length <= 36) return 60;
  return 48;
}

function Artwork({ src, title, tile }: { src: string | null; title: string; tile?: HeroTile }) {
  if (src) {
    return <img loading="lazy" decoding="async" src={src} alt="" className="h-[232px] w-[232px] shrink-0 rounded-art object-cover shadow-float" />;
  }
  if (tile) {
    return (
      <span
        aria-hidden="true"
        data-testid="page-tile"
        className={`grid h-[232px] w-[232px] shrink-0 place-items-center rounded-art shadow-float ${tile.accent ? "bg-accent text-on-accent" : "bg-wash text-accent"}`}
      >
        <Icon icon={tile.icon} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid="page-monogram"
      className="grid h-[232px] w-[232px] shrink-0 place-items-center rounded-art bg-wash text-[72px] font-bold text-ink-2 shadow-float"
    >
      {monogram(title)}
    </span>
  );
}

export function goBackOrTabRoot() {
  const nav = useNavigation.getState();
  if (nav.navPast.length > 0) nav.goBack();
  else nav.navigate(tabRoot(nav.tab));
}

export function PageHeader({ title, meta, artwork, actions, titleId, titleTooltip, icon, tile, onBack, eyebrow, footer, description, onEdit, sharedArtworkId }: PageHeaderProps) {
  const phone = usePhone();
  const view = useNavigation((state) => state.view);
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
        description={description}
        onEdit={onEdit}
        sharedArtworkId={sharedArtworkId}
        onBack={onBack ?? (isTabRoot(view) ? undefined : goBackOrTabRoot)}
      />
    );
  }
  const cover = artwork !== undefined;
  const header = (
    <header className={`app-page-header flex min-w-0 justify-between gap-6 ${cover ? "items-end" : "items-start"}`}>
      {cover && (onEdit ? (
        <button type="button" onClick={onEdit} aria-label={`Edit details for ${title}`} className="shrink-0 rounded-art focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <Artwork src={artwork} title={title} tile={tile} />
        </button>
      ) : (
        <Artwork src={artwork} title={title} tile={tile} />
      ))}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className={cover ? "mb-1 text-[14px] font-semibold text-ink-1" : "mb-2 text-meta font-semibold text-ink-2"}>{eyebrow}</p>}
        <h1
          id={titleId}
          title={titleTooltip}
          style={cover ? { fontSize: `${collectionTitleSize(title)}px`, lineHeight: 1.02 } : undefined}
          className={cover ? "line-clamp-2 break-words font-bold tracking-[-0.035em] text-ink-1" : "break-words text-page-title text-ink-1"}
        >
          {onEdit ? (
            <button type="button" onClick={onEdit} className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              {title}
            </button>
          ) : (
            title
          )}
        </h1>
        {description && cover && <p className="mt-2 line-clamp-3 max-w-[60ch] text-body text-ink-2">{description}</p>}
        {meta && <div className={`${cover ? "mt-3 text-body" : "mt-1 text-meta"} tabular-nums text-ink-2`}>{meta}</div>}
        {actions && cover && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {actions && !cover && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
  if (!footer) return header;
  return (
    <>
      {header}
      <div className="mt-7">{footer}</div>
    </>
  );
}
