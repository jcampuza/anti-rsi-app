import { ipcMain } from 'electron'
import { IPC_ACTIONS, IPC_EVENTS } from '../common/actions'
import { type Store } from '../common/store/store'
import { Effect } from 'effect'
import { type Action } from '../common/store/actions'
import { selectConfig, selectProcesses, selectSnapshot } from '../common/store/selectors'

export const wireIpcHandlers = (store: Store): Effect.Effect<void> => {
  return Effect.sync(() => {
    ipcMain.handle(IPC_ACTIONS.GET_SNAPSHOT, () => selectSnapshot(store.getState()))

    ipcMain.handle(IPC_ACTIONS.GET_CONFIG, () => selectConfig(store.getState()))

    ipcMain.handle(IPC_ACTIONS.GET_PROCESSES, () => selectProcesses(store.getState()))

    // One-shot init emission: when a renderer calls SUBSCRIBE_ALL, immediately send current state
    ipcMain.handle(IPC_ACTIONS.SUBSCRIBE_ALL, (event) => {
      const config = selectConfig(store.getState())
      const snapshot = selectSnapshot(store.getState())
      const processes = selectProcesses(store.getState())
      event.sender.send(IPC_EVENTS.EVENT, {
        type: 'init',
        config,
        snapshot,
        processes
      })
    })

    ipcMain.handle(IPC_ACTIONS.COMMAND, async (_event, action: Action) => {
      return store.dispatch(action)
    })
  })
}
