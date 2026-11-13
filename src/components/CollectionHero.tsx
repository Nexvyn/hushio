import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { PageHeader } from "./PageHeader";

type CollectionHeroProps = {
  ambient?: boolean;
  title: string;
  covers: string[];
  facts: ReactNode;
  children: ReactNode;
  icon?: IconSvgElement;
  onBack?: () => void;
};

export function CollectionHero({ title, covers, facts, children, ambient = false, icon, onBack }: CollectionHeroProps) {
  return (
    <PageHeader
      title={title}
      meta={facts}
      artwork={covers[0] ?? null}
      actions={children}
      ambient={ambient}
      icon={icon}
      onBack={onBack}
    />
  );
}
