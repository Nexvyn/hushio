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
  centered?: boolean;
};

export function EmptyState({ title, message, icon, action, secondaryAction, centered = false }: EmptyStateProps) {
  const ink = useInk();
  const body = (
    <>
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
    </>
  );
  if (!centered) {
    return <section className="animate-fade-in flex flex-col items-center px-6 py-12 text-center">{body}</section>;
  }
  return (
    <section className="animate-fade-in grid flex-1 place-items-center px-6 py-12 text-center">
      <div className="flex flex-col items-center">{body}</div>
    </section>
  );
}
