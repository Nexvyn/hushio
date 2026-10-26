import type { IconSvgElement } from "@hugeicons/react";
import { Button } from "./Button";
import { Icon } from "./Icon";

type EmptyStateProps = {
  title: string;
  message: string;
  icon?: IconSvgElement;
  action?: { label: string; onClick: () => void };
};

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <section className="rounded-[11px] border border-separator bg-panel px-6 py-10 text-center">
      {icon && (
        <span aria-hidden="true" className="mb-3 inline-flex text-ink-2">
          <Icon icon={icon} />
        </span>
      )}
      <h2 className="text-[17px] font-semibold text-ink-1">{title}</h2>
      <p className="mt-1 text-[12.5px] text-ink-2">{message}</p>
      {action && (
        <Button className="mt-4" variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </section>
  );
}
