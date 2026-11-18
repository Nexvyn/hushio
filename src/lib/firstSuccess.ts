export type Attempt<T> = (index: number, cancel: AbortSignal) => Promise<T>;

export function firstSuccess<T>(count: number, attempt: Attempt<T>, staggerMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (count === 0) {
      reject(new Error("no attempts"));
      return;
    }
    const controllers: AbortController[] = [];
    let launched = 0;
    let pending = 0;
    let settled = false;
    let lastError: unknown = new Error("no attempts");
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clear = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const schedule = () => {
      clear();
      if (!settled && launched < count) timer = setTimeout(launch, staggerMs);
    };

    function launch(): void {
      clear();
      if (settled || launched >= count) return;
      const index = launched++;
      const controller = new AbortController();
      controllers.push(controller);
      pending++;
      new Promise<T>((ok) => ok(attempt(index, controller.signal))).then(
        (value) => {
          pending--;
          if (settled) return;
          settled = true;
          clear();
          controllers.forEach((other, i) => {
            if (i !== index) other.abort();
          });
          resolve(value);
        },
        (error: unknown) => {
          pending--;
          if (settled) return;
          lastError = error;
          if (launched < count) launch();
          else if (pending === 0) {
            settled = true;
            clear();
            reject(lastError);
          }
        },
      );
      schedule();
    }

    launch();
  });
}
