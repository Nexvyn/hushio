import type { IconSvgElement } from "@hugeicons/react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { useInk } from "../lib/onArt";

type EmptyStateAction = { label: string; onClick: () => void };

type EmptyStateProps = {
  title: string;
  message: string;
  icon?: IconSvgElement;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
};

export function EmptyState({ title, message, icon, action, secondaryAction }: EmptyStateProps) {
  const ink = useInk();
  return (
    <section className="animate-fade-in flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <span aria-hidden="true" className={`mb-3 grid h-11 w-11 place-items-center rounded-full ${ink.tint} ${ink.secondary}`}>
          <Icon icon={icon} />
        </span>
      )}
      <h2 className={`text-[16px] font-semibold ${ink.primary}`}>{title}</h2>
      {message && <p className={`mt-1 max-w-sm text-[13px] ${ink.secondary}`}>{message}</p>}
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
