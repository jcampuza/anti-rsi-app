import { powerMonitor, BrowserWindow } from 'electron'
import { type AntiRsiEvent, type AntiRsiSnapshot } from '../../common/antirsi-core'
import { AntiRsiService } from './antirsi-service'
import { ProcessService } from './process-service'
import { OverlayManager } from './overlay-manager'
import { broadcastAntiRsiEvent } from './window-utils'
import { IPC_EVENTS } from '../../common/actions'

export class AppOrchestrator {
  private unsubscribeAntiRsi: (() => void) | null = null
  private unsubscribeProcesses: (() => void) | null = null
  private lastStatusBroadcastAt = 0
  private readonly statusThrottleMs = 250

  constructor(
    private readonly antiRsiService: AntiRsiService,
    private readonly processService: ProcessService,
    private readonly overlayManager: OverlayManager
  ) {}

  start(): void {
    // Subscribe to AntiRSI domain events and fan out with throttling
    this.unsubscribeAntiRsi = this.antiRsiService.subscribe(
      (event: AntiRsiEvent, snapshot: AntiRsiSnapshot) => {
        if (event.type === 'status-update') {
          const now = Date.now()
          if (now - this.lastStatusBroadcastAt < this.statusThrottleMs) {
            return
          }
          this.lastStatusBroadcastAt = now
        }
        broadcastAntiRsiEvent(event, snapshot)

        if (event.type === 'mini-break-start') {
          this.overlayManager.ensureOverlayWindows('mini')
        } else if (event.type === 'work-break-start') {
          this.overlayManager.ensureOverlayWindows('work')
        } else if (event.type === 'break-end') {
          this.overlayManager.hideOverlayWindows()
        }
      }
    )

    // Subscribe to process changes to manage inhibitors and update store
    this.unsubscribeProcesses = this.processService.subscribe((list) => {
      this.antiRsiService.setProcesses(list)
      const hasAny = list.length > 0
      if (hasAny) {
        this.antiRsiService.addInhibitor('process:zoom')
      } else {
        this.antiRsiService.removeInhibitor('process:zoom')
      }
      // Broadcast to renderers via unified event
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(IPC_EVENTS.EVENT, { type: 'processes-updated', list })
      })
    })

    // System power events as inhibitors
    powerMonitor.on('suspend', () => this.antiRsiService.addInhibitor('system:suspend'))
    powerMonitor.on('resume', () => this.antiRsiService.removeInhibitor('system:suspend'))
    powerMonitor.on('lock-screen', () => this.antiRsiService.addInhibitor('system:lock'))
    powerMonitor.on('unlock-screen', () => this.antiRsiService.removeInhibitor('system:lock'))
  }

  stop(): void {
    this.unsubscribeAntiRsi?.()
    this.unsubscribeAntiRsi = null
    this.unsubscribeProcesses?.()
    this.unsubscribeProcesses = null
    powerMonitor.removeAllListeners('suspend')
    powerMonitor.removeAllListeners('resume')
    powerMonitor.removeAllListeners('lock-screen')
    powerMonitor.removeAllListeners('unlock-screen')
  }
}
