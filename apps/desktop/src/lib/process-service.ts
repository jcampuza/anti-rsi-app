import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Emitter } from './emitter';
import { writeAppLog } from './app-logger';

const execFileAsync = promisify(execFile);

export const WATCHED_PROCESSES = ['zoom.us'];
const DEFAULT_INTERVAL_MS = 2500;
const DEFAULT_DEBOUNCE_MS = 400;

const watched = WATCHED_PROCESSES;
const intervalMs = DEFAULT_INTERVAL_MS;
const debounceMs = DEFAULT_DEBOUNCE_MS;

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
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private current = new Set<string>();
  private pending: Set<string> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly changes = new Emitter<string[]>();

  subscribe(listener: (processes: string[]) => void): () => void {
    return this.changes.subscribe(listener);
  }

  start(): void {
    if (this.intervalId !== null) {
      return;
    }
    void this.pollAndNotify();
    this.intervalId = setInterval(() => {
      void this.pollAndNotify();
    }, intervalMs);
  }

  dispose(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pending = null;
  }

  private async pollAndNotify(): Promise<void> {
    try {
      const next = await pollProcesses();
      if (areSetsEqual(this.current, next)) {
        return;
      }
      this.scheduleDebouncedEmit(next);
    } catch (error) {
      writeAppLog('main', 'ProcessService polling error', error);
    }
  }

  private scheduleDebouncedEmit(next: Set<string>): void {
    this.pending = next;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.pending === null) {
        return;
      }
      const processes = Array.from(this.pending);
      this.pending = null;
      this.current = new Set(processes);
      writeAppLog('main', 'ProcessService: processes changed', { processes });
      this.changes.publish(processes);
    }, debounceMs);
  }
}
