import { EventEmitter } from 'node:events'

export type ProcessesListener = (processes: string[]) => void

export class ProcessStore {
  private processes: Set<string> = new Set<string>()
  private emitter = new EventEmitter()

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

  setProcesses(newProcesses: Set<string>): void {
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
}

export default ProcessStore
