import { ipcMain } from 'electron'
import { AntiRsiConfig } from '../common/antirsi-core'
import { IPC_ACTIONS } from '../common/actions'
import AntiRsiService from './lib/antirsi-service'
import ProcessStore from './lib/process-store'

export function wireIpcHandlers(antiRsiService: AntiRsiService, processStore: ProcessStore): void {
  ipcMain.handle(IPC_ACTIONS.GET_SNAPSHOT, () => antiRsiService.getSnapshot())

  ipcMain.handle(IPC_ACTIONS.GET_CONFIG, () => antiRsiService.getConfig())

  ipcMain.handle(IPC_ACTIONS.SET_CONFIG, async (_event, config: Partial<AntiRsiConfig>) => {
    await antiRsiService.setConfig(config)
    return antiRsiService.getConfig()
  })

  ipcMain.handle(IPC_ACTIONS.TRIGGER_WORK_BREAK, () => antiRsiService.triggerWorkBreak())

  ipcMain.handle(IPC_ACTIONS.POSTPONE_WORK_BREAK, () => antiRsiService.postponeWorkBreak())

  ipcMain.handle(IPC_ACTIONS.SKIP_WORK_BREAK, () => antiRsiService.skipWorkBreak())

  ipcMain.handle(IPC_ACTIONS.PAUSE, () => antiRsiService.pause())

  ipcMain.handle(IPC_ACTIONS.RESUME, () => antiRsiService.resume())

  ipcMain.handle(IPC_ACTIONS.RESET_TIMINGS, () => antiRsiService.resetTimings())

  ipcMain.handle(IPC_ACTIONS.GET_PROCESSES, () => Array.from(processStore.getProcesses()))
}
