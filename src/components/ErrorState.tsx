import { WarningCircle } from "@phosphor-icons/react";
import { EmptyState } from "./EmptyState";

type ErrorStateProps = {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
};

export function ErrorState({ title, message, action }: ErrorStateProps) {
  return (
    <div role="alert">
      <EmptyState icon={WarningCircle} title={title} message={message} action={action} />
    </div>
  );
}
