import { EventEmitter } from 'node:events'
import { exec } from 'node:child_process'

export const WATCHED_PROCESSES = ['zoom.us']

export type ProcessesListener = (processes: string[]) => void

export class ProcessService {
  private processes: Set<string> = new Set<string>()
  private emitter = new EventEmitter()
  private intervalId: NodeJS.Timeout | undefined

  getProcesses(): Set<string> {
    return new Set(this.processes)
  }

  getProcessesList(): string[] {
    return Array.from(this.processes)
  }

  subscribe(listener: ProcessesListener): () => void {
    this.emitter.on('change', listener)
    return () => this.emitter.off('change', listener)
  }

  private getRunningProcesses(): Promise<Set<string>> {
    return new Promise<Set<string>>((resolve, reject) => {
      let processes = new Set<string>()
      exec('ps -axo comm', (error, stdout) => {
        if (error) {
          console.error(error)
          reject(error)
        }

        for (const line of stdout.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          for (const process of WATCHED_PROCESSES) {
            if (trimmed.includes(process)) {
              processes.add(process)
            }
          }
        }

        resolve(processes)
      })
    })
  }

  private setProcesses(newProcesses: Set<string>): void {
    if (!this.areSetsEqual(this.processes, newProcesses)) {
      this.processes = new Set(newProcesses)
      this.emitter.emit('change', this.getProcessesList())
    }
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
      const processes = await this.getRunningProcesses()
      this.setProcesses(processes)
      options.onTick?.(processes)
    }, 1000)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }
}

export default ProcessService
