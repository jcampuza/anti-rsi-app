import { Effect, Schedule, Duration, Stream, SubscriptionRef } from 'effect';
import * as Command from '@effect/platform/Command';
import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor';

export const WATCHED_PROCESSES = ['zoom.us'];
const DEFAULT_INTERVAL_MS = 2500;
const DEFAULT_DEBOUNCE_MS = 400;

const watched = WATCHED_PROCESSES;
const intervalMs = DEFAULT_INTERVAL_MS;
const debounceMs = DEFAULT_DEBOUNCE_MS;

export type ProcessesListener = (processes: string[]) => void;

const areSetsEqual = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
};

export class ProcessService extends Effect.Service<ProcessService>()('ProcessService', {
  scoped: Effect.gen(function* () {
    // Ref for reactive state management
    const processesRef = yield* SubscriptionRef.make<Set<string>>(new Set());

    // Poll processes
    const pollOnce = Effect.gen(function* () {
      const running = new Set<string>();
      for (const name of watched) {
        const command = Command.make('pgrep', '-x', name);
        const lines = yield* Command.lines(command);
        if (lines.length > 0) {
          running.add(name);
        }
      }
      return running;
    });

    // Create a stream that polls on a schedule, filters distinct values, debounces, and updates the ref
    const pollingStream = Stream.repeatEffectWithSchedule(
      pollOnce,
      Schedule.spaced(Duration.millis(intervalMs)),
    ).pipe(
      // Only emit when the set actually changes (using custom equality)
      Stream.changesWith((prev, next) => areSetsEqual(prev, next)),
      // Debounce rapid changes
      Stream.debounce(Duration.millis(debounceMs)),
      // Update the SubscriptionRef with each new value
      Stream.runForEach((current) =>
        Effect.gen(function* () {
          yield* Effect.log('ProcessService: processes changed', {
            processes: Array.from(current),
          });
          yield* SubscriptionRef.set(processesRef, current);
        }),
      ),
      // Catch and log any errors without crashing
      Effect.catchAll((err) => Effect.logError('ProcessService polling error', err)),
    );

    // Fork the polling stream to run in the background
    yield* Effect.forkScoped(pollingStream);

    // Expose the stream of changes as an array for easier consumption
    const changesAsArray: Stream.Stream<string[]> = processesRef.changes.pipe(
      Stream.map((set) => Array.from(set)),
    );

    return {
      changes: changesAsArray,
    } as const;
  }),
  dependencies: [NodeCommandExecutor.layer],
}) {}
