import { ipcMain } from 'electron'
import { AntiRsiConfig } from '../common/antirsi-core'
import { IPC_ACTIONS } from '../common/actions'
import AntiRsiService from './lib/antirsi-service'
import ProcessService from './lib/process-service'
import { Effect } from 'effect'

export const wireIpcHandlers = (antiRsiService: AntiRsiService, processService: ProcessService) => {
  return Effect.sync(() => {
    ipcMain.handle(IPC_ACTIONS.GET_SNAPSHOT, () => antiRsiService.getSnapshot())

    ipcMain.handle(IPC_ACTIONS.GET_CONFIG, () => antiRsiService.getConfig())

    ipcMain.handle(IPC_ACTIONS.SET_CONFIG, async (_event, config: Partial<AntiRsiConfig>) => {
      await antiRsiService.setConfig(config)
      return antiRsiService.getConfig()
    })

    ipcMain.handle(IPC_ACTIONS.RESET_CONFIG_TO_DEFAULTS, async () => {
      await antiRsiService.resetConfigToDefaults()
      return antiRsiService.getConfig()
    })

    ipcMain.handle(IPC_ACTIONS.TRIGGER_WORK_BREAK, () => antiRsiService.triggerWorkBreak())

    ipcMain.handle(IPC_ACTIONS.TRIGGER_MICRO_PAUSE, () => antiRsiService.triggerMicroPause())

    ipcMain.handle(IPC_ACTIONS.POSTPONE_WORK_BREAK, () => antiRsiService.postponeWorkBreak())

    ipcMain.handle(IPC_ACTIONS.SKIP_WORK_BREAK, () => antiRsiService.skipWorkBreak())

    ipcMain.handle(IPC_ACTIONS.PAUSE, () => antiRsiService.pause())

    ipcMain.handle(IPC_ACTIONS.RESUME, () => antiRsiService.resume())

    ipcMain.handle(IPC_ACTIONS.RESET_TIMINGS, () => antiRsiService.resetTimings())

    ipcMain.handle(IPC_ACTIONS.GET_PROCESSES, () => Array.from(processService.getProcesses()))
  })
}
