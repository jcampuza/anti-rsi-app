import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Emitter } from './emitter';
import { writeAppLog } from './app-logger';
import { startSpacedLoop } from './spaced-loop';

const execFileAsync = promisify(execFile);

export const WATCHED_PROCESSES = ['zoom.us'];
const DEFAULT_INTERVAL_MS = 2500;

const watched = WATCHED_PROCESSES;
const intervalMs = DEFAULT_INTERVAL_MS;

const areSetsEqual = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
};

const isProcessRunning = async (name: string): Promise<boolean> => {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-x', name]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
};

const pollProcesses = async (): Promise<Set<string>> => {
  const running = new Set<string>();
  for (const name of watched) {
    if (await isProcessRunning(name)) {
      running.add(name);
    }
  }
  return running;
};

export class ProcessService {
  private stopLoop: (() => void) | null = null;
  private current = new Set<string>();
  private readonly changes = new Emitter<string[]>();

  subscribe(listener: (processes: string[]) => void): () => void {
    return this.changes.subscribe(listener);
  }

  start(): void {
    if (this.stopLoop !== null) {
      return;
    }
    this.stopLoop = startSpacedLoop(
      (signal) => this.pollAndNotify(signal),
      intervalMs,
      {
        continueOnError: true,
        onError: (error) => {
          writeAppLog('main', 'ProcessService polling error', error);
        },
      },
    );
  }

  dispose(): void {
    if (this.stopLoop !== null) {
      this.stopLoop();
      this.stopLoop = null;
    }
  }

  private async pollAndNotify(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const next = await pollProcesses();
    signal.throwIfAborted();

    if (areSetsEqual(this.current, next)) {
      return;
    }

    this.current = next;
    const processes = Array.from(next);
    writeAppLog('main', 'ProcessService: processes changed', { processes });
    this.changes.publish(processes);
  }
}
