import { Effect, Layer } from 'effect'
import { AntiRsiRendererApi, ProcessesRendererApi } from '@renderer/hooks/useAntiRsiApi'

const getApi = (): AntiRsiRendererApi => window.api.antirsi

const getProcessesApi = (): ProcessesRendererApi => window.api.processes

export class AntiRsiService extends Effect.Service<AntiRsiService>()('electron', {
  effect: Effect.gen(function* () {
    const api = getApi()
    return api
  })
}) {}

export class ProcessesService extends Effect.Service<ProcessesService>()('electron', {
  effect: Effect.gen(function* () {
    const api = getProcessesApi()

    return api
  })
}) {}

export const AntiRsiLayer = Layer.merge(AntiRsiService.Default, ProcessesService.Default)
