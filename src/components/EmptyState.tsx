import type { IconSvgElement } from "@hugeicons/react";
import { Button } from "./Button";
import { Icon } from "./Icon";

type EmptyStateAction = { label: string; onClick: () => void };

type EmptyStateProps = {
  title: string;
  message: string;
  icon?: IconSvgElement;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
};

export function EmptyState({ title, message, icon, action, secondaryAction }: EmptyStateProps) {
  return (
    <section className="animate-fade-in rounded-[11px] border border-separator bg-panel px-6 py-10 text-center">
      {icon && (
        <span aria-hidden="true" className="bt-breath mb-3 inline-flex rounded-full p-2 text-ink-2">
          <Icon icon={icon} />
        </span>
      )}
      <h2 className="text-[17px] font-semibold text-ink-1">{title}</h2>
      <p className="mt-1 text-[12.5px] text-ink-2">{message}</p>
      {(action || secondaryAction) && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {action && (
            <Button variant="primary" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
