import { Button } from "./Button";

type ErrorStateProps = {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
};

export function ErrorState({ title, message, action }: ErrorStateProps) {
  return (
    <section
      role="alert"
      className="rounded-[11px] border border-danger/35 bg-panel px-6 py-10 text-center"
    >
      <h2 className="text-[17px] font-semibold text-danger-text">{title}</h2>
      <p className="mt-1 text-[12.5px] text-ink-2">{message}</p>
      {action && (
        <Button className="mt-4" variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </section>
  );
}
