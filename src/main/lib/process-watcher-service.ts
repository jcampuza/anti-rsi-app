import { exec } from 'node:child_process'

export const WATCHED_PROCESSES = ['zoom.us']

export interface ProcessStoreLike {
  setProcesses: (processes: Set<string>) => void
  getProcesses: () => Set<string>
}

export class ProcessWatcherService {
  private intervalId: NodeJS.Timeout | undefined

  processes = new Set<string>()

  getRunningProcesses() {
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

  start(options: { store: ProcessStoreLike; onTick?: (processes: Set<string>) => void }) {
    this.intervalId = setInterval(async () => {
      const processes = await this.getRunningProcesses()
      this.processes = processes
      options.store.setProcesses(processes)
      options.onTick?.(processes)
    }, 1000)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }
}
