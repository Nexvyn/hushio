import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";

type CollectionHeroProps = {
  ambient?: boolean;
  title: string;
  covers: string[];
  facts: ReactNode;
  children: ReactNode;
};

export function CollectionHero({ title, covers, facts, children, ambient = false }: CollectionHeroProps) {
  return <PageHeader title={title} meta={facts} artwork={covers[0] ?? null} actions={children} ambient={ambient} />;
}
