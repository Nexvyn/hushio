import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import { useInk } from "../lib/onArt";
import { usePhone } from "../lib/usePhone";

type EmptyStateAction = { label: string; onClick: () => void };

type EmptyStateProps = {
  title: string;
  message: string;
  icon?: PhosphorIcon;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  centered?: boolean;
};

export function EmptyState({ title, message, icon, action, secondaryAction, centered = false }: EmptyStateProps) {
  const ink = useInk();
  const phone = usePhone();
  if (phone) {
    return (
      <section className={`animate-fade-in mx-auto flex max-w-[280px] flex-col items-center px-4 text-center ${centered ? "min-h-[calc(100dvh-var(--phone-empty-offset,240px))] flex-1 justify-center py-8" : "pt-8"}`}>
        {icon && (
          <span aria-hidden="true" className="grid place-items-center text-ink-2">
            <PhoneIcon icon={icon} />
          </span>
        )}
        <h2 className="mt-3 text-card-title font-semibold leading-[22px] text-ink-1">{title}</h2>
        {message && <p className="mt-1 text-body leading-5 text-ink-2">{message}</p>}
        {(action || secondaryAction) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {action && (
              <button
                type="button"
                onClick={action.onClick}
                className="inline-flex h-11 items-center justify-center rounded-[12px] [corner-shape:squircle] bg-primary px-5 text-body font-semibold text-on-primary hover:opacity-90 motion-safe:transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {action.label}
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex h-11 items-center justify-center rounded-[12px] px-5 text-body font-semibold text-ink-1 motion-safe:transition-colors hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </section>
    );
  }
  const body = (
    <>
      {icon && (
        <span aria-hidden="true" className={`mb-3 grid h-11 w-11 place-items-center rounded-full ${ink.tint} ${ink.secondary}`}>
          <Icon icon={icon} />
        </span>
      )}
      <h2 className={`text-body font-semibold ${ink.primary}`}>{title}</h2>
      {message && <p className={`mt-1 max-w-sm text-meta ${ink.secondary}`}>{message}</p>}
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
