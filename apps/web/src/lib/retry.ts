import { Duration, Effect, Schedule } from "effect";

export type RetryBackoffOptions = {
  retries: number;
  delaysMs: readonly number[];
};

const retrySchedule = (options: RetryBackoffOptions) =>
  Schedule.recurs(options.retries).pipe(
    Schedule.addDelay((attempt) =>
      Effect.succeed(
        Duration.millis(
          options.delaysMs[attempt] ?? options.delaysMs.at(-1) ?? 0,
        ),
      ),
    ),
  );

export function retryWithBackoffEffect<T>(
  operation: () => Promise<T>,
  options: RetryBackoffOptions,
): Effect.Effect<T, unknown> {
  return Effect.tryPromise({
    try: () => operation(),
    catch: (error) => error,
  }).pipe(Effect.retry(retrySchedule(options)));
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryBackoffOptions,
): Promise<T> {
  return Effect.runPromise(retryWithBackoffEffect(operation, options));
}
