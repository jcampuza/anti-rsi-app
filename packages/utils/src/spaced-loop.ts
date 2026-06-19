const abortableDelay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    function onAbort(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal.addEventListener("abort", onAbort, { once: true });
  });

export type SpacedLoopTask = (signal: AbortSignal) => void | Promise<void>;

export type StartSpacedLoopOptions = {
  /** Called when `task` throws or rejects. Not called for loop cancellation. */
  onError?: (error: unknown) => void | Promise<void>;
  /**
   * When false (default), the loop stops after the first task error.
   * When true, `onError` runs and the loop continues after the interval.
   */
  continueOnError?: boolean;
};

/**
 * Runs `task` repeatedly with `intervalMs` of idle time after each run finishes.
 * Unlike setInterval, a new run never starts until the previous one completes.
 *
 * Pass `signal` into cancellable work (fetch, streams, or `signal.throwIfAborted()`
 * between steps). Calling the returned stop function aborts the signal and cancels
 * the pending interval wait.
 */
export const startSpacedLoop = (
  task: SpacedLoopTask,
  intervalMs: number,
  options: StartSpacedLoopOptions = {},
): (() => void) => {
  const controller = new AbortController();
  const { signal } = controller;
  const continueOnError = options.continueOnError ?? false;

  void (async () => {
    while (!signal.aborted) {
      try {
        await task(signal);
      } catch (error) {
        if (signal.aborted) {
          break;
        }

        await options.onError?.(error);

        if (!continueOnError) {
          break;
        }
      }

      try {
        await abortableDelay(intervalMs, signal);
      } catch {
        break;
      }
    }
  })();

  return () => {
    controller.abort();
  };
};
