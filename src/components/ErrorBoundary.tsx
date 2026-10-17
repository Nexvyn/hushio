import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";

type ErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
  scope?: "root" | "view";
};

type ErrorBoundaryState = {
  error: Error | null;
  componentStack: string;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
    console.error("[hushio] renderer crashed:", error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, componentStack: "" });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const scope = this.props.scope ?? "root";

    return (
      <div
        className={`${
          scope === "root" ? "h-screen w-screen" : "h-full w-full"
        } grid place-items-center bg-base text-ink-1`}
      >
        <div className="animate-pop-in max-w-md px-6 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-separator bg-panel text-warn">
            <Icon icon={Alert02Icon} />
          </div>
          <h1 className="mb-2 font-display text-lg font-bold text-ink-1">
            Something went wrong
          </h1>
          <p className="mb-1.5 text-sm text-ink-2">
            Hushio hit an unexpected error. Your library is safe — reloading usually fixes it.
          </p>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer select-none text-xs text-ink-2 transition-colors hover:text-ink-1">
              Technical details
            </summary>
            <p className="mt-2 break-words rounded-lg border border-separator bg-ink-1/[0.06] p-3 text-xs text-ink-2">
              {error.message}
            </p>
          </details>
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(`${error.message}

${this.state.componentStack}`)
                  .catch(() => {})
              }
              className="rounded-full px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink-1"
            >
              Copy details
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-[filter] hover:brightness-110"
            >
              Reload Hushio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
