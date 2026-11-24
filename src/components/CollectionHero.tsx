import type { ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { PageHeader, type HeroTile } from "./PageHeader";

type CollectionHeroProps = {
    title: string;
  covers: string[];
  facts: ReactNode;
  children?: ReactNode;
  icon?: PhosphorIcon;
  tile?: HeroTile;
  onBack?: () => void;
  eyebrow?: string;
  footer?: ReactNode;
  description?: string;
  onEdit?: () => void;
  hideArtwork?: boolean;
};

export function CollectionHero({ title, covers, facts, children, icon, tile, onBack, eyebrow, footer, description, onEdit, hideArtwork }: CollectionHeroProps) {
  return (
    <PageHeader
      title={title}
      meta={facts}
      artwork={hideArtwork ? undefined : covers[0] ?? null}
      actions={children}
      icon={icon}
      tile={tile}
      onBack={onBack}
      eyebrow={eyebrow}
      footer={footer}
      description={description}
      onEdit={onEdit}
    />
  );
}
