import { powerMonitor } from 'electron'
import {
  AntiRsiCore,
  AntiRsiConfig,
  AntiRsiEvent,
  AntiRsiSnapshot
} from '../../common/antirsi-core'
import ConfigStore from './config-store'

export type AntiRsiServiceCallbacks = {
  onEvent: (event: AntiRsiEvent, snapshot: AntiRsiSnapshot) => void
  onConfigChanged?: (config: AntiRsiConfig) => void
}

class AntiRsiService {
  private readonly core: AntiRsiCore
  private readonly callbacks: AntiRsiServiceCallbacks
  private readonly configStore: ConfigStore
  private timer: NodeJS.Timeout | undefined

  constructor(options: {
    callbacks: AntiRsiServiceCallbacks
    configStore: ConfigStore
    initialConfig?: Partial<AntiRsiConfig>
  }) {
    this.callbacks = options.callbacks
    this.configStore = options.configStore
    this.core = new AntiRsiCore({ config: options.initialConfig })
    this.core.subscribe((event, snapshot) => {
      this.callbacks.onEvent(event, snapshot)
    })
    this.callbacks.onConfigChanged?.(this.core.getConfig())
  }

  start(): void {
    this.restartTimer()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  getSnapshot(): AntiRsiSnapshot {
    return this.core.getSnapshot()
  }

  getConfig(): AntiRsiConfig {
    return this.core.getConfig()
  }

  async setConfig(config: Partial<AntiRsiConfig>): Promise<void> {
    this.core.setConfig(config)
    this.restartTimer()
    const currentConfig = this.core.getConfig()
    await this.configStore.save(currentConfig)
    this.callbacks.onConfigChanged?.(currentConfig)
  }

  triggerWorkBreak(): void {
    this.core.triggerWorkBreak()
  }

  postponeWorkBreak(): void {
    this.core.postponeWorkBreak()
  }

  skipWorkBreak(): void {
    this.core.skipWorkBreak()
  }

  pause(): void {
    this.core.pause()
  }

  resume(): void {
    this.core.resume()
    this.restartTimer()
  }

  resetTimings(): void {
    this.core.resetTimings()
    this.restartTimer()
  }

  isPaused(): boolean {
    return this.core.isPaused()
  }

  private restartTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
    }

    const { tickIntervalMs } = this.core.getConfig()
    this.timer = setInterval(() => {
      const idleSeconds =
        typeof powerMonitor.getSystemIdleTime === 'function' ? powerMonitor.getSystemIdleTime() : 0
      if (!this.core.isPaused()) {
        this.core.tick(idleSeconds)
      }
    }, tickIntervalMs)
  }
}

export default AntiRsiService
