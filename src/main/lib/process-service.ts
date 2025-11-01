import { EventEmitter } from "node:events"
import { exec } from "node:child_process"

export const WATCHED_PROCESSES = ["zoom.us"]

export type ProcessesListener = (processes: string[]) => void

export class ProcessService {
  private processes: Set<string> = new Set<string>()
  private emitter = new EventEmitter()
  private intervalId: NodeJS.Timeout | undefined
  private watched: string[]
  private intervalMs: number
  private debounceMs: number
  private debounceTimer: NodeJS.Timeout | undefined

  constructor(options: { watched?: string[]; intervalMs?: number; debounceMs?: number } = {}) {
    this.watched = options.watched ?? WATCHED_PROCESSES
    this.intervalMs = options.intervalMs ?? 2500
    this.debounceMs = options.debounceMs ?? 400
  }

  getProcesses(): Set<string> {
    return new Set(this.processes)
  }

  getProcessesList(): string[] {
    return Array.from(this.processes)
  }

  subscribe(listener: ProcessesListener): () => void {
    this.emitter.on("change", listener)
    return () => this.emitter.off("change", listener)
  }

  private getRunningProcesses(): Promise<Set<string>> {
    const checks = this.watched.map((name) => this.isRunningExact(name))
    return Promise.all(checks).then((results) => {
      const set = new Set<string>()
      results.forEach((running, idx) => {
        if (running) set.add(this.watched[idx])
      })
      return set
    })
  }

  private isRunningExact(name: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // Quote the name to avoid shell interpretation; -x matches the exact process name
      exec(`pgrep -x ${this.escapeArg(name)}`, (error, stdout) => {
        if (error) {
          resolve(false)
          return
        }
        resolve(stdout.trim().length > 0)
      })
    })
  }

  private escapeArg(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`
  }

  private setProcesses(newProcesses: Set<string>): void {
    if (this.areSetsEqual(this.processes, newProcesses)) return
    this.processes = new Set(newProcesses)

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.emitter.emit("change", this.getProcessesList())
    }, this.debounceMs)
  }

  private areSetsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false
    for (const value of a) {
      if (!b.has(value)) return false
    }
    return true
  }

  start(options: { onTick?: (processes: Set<string>) => void } = {}): void {
    this.intervalId = setInterval(async () => {
      try {
        const processes = await this.getRunningProcesses()
        this.setProcesses(processes)
        options.onTick?.(processes)
      } catch (e) {
        console.error(e)
      }
    }, this.intervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
  }
}
