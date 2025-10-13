import type { AntiRsiConfig, AntiRsiSnapshot } from '../../../common/antirsi-core'
import { AntiRsiLayer, AntiRsiService } from '@renderer/utils/anti-rsi-layer'
import { Chunk, Effect, Layer, Stream } from 'effect'
import { Atom } from '@effect-atom/atom-react'

class AntiRsiStoreRendererService extends Effect.Service<AntiRsiStoreRendererService>()(
  'AntiRsiStoreRendererService',
  {
    dependencies: [AntiRsiService.Default],

    effect: Effect.gen(function* () {
      const api = yield* AntiRsiService

      return {
        config: Stream.concat(
          Stream.fromEffect(Effect.promise(() => api.getConfig())),
          Stream.async<AntiRsiConfig>((emit) => {
            const unsubscribe = api.subscribeConfig((config) => {
              emit(Effect.succeed(Chunk.of(config)))
            })
            return Effect.sync(() => unsubscribe())
          })
        ),
        snapshot: Stream.concat(
          Stream.fromEffect(Effect.promise(() => api.getSnapshot())),
          Stream.async<AntiRsiSnapshot>((emit) => {
            const unsubscribe = api.subscribe((_event, snapshot) => {
              emit(Effect.succeed(Chunk.of(snapshot)))
            })
            return Effect.sync(() => unsubscribe())
          })
        )
      }
    })
  }
) {}

export const storeRuntime = Atom.runtime(
  AntiRsiLayer.pipe(Layer.merge(AntiRsiStoreRendererService.Default))
)

export const configAtom = storeRuntime
  .atom(
    Stream.unwrap(
      Effect.gen(function* () {
        const api = yield* AntiRsiStoreRendererService

        return api.config
      })
    )
  )
  .pipe(Atom.keepAlive)

export const snapshotAtom = storeRuntime
  .atom(
    Stream.unwrap(
      Effect.gen(function* () {
        const api = yield* AntiRsiStoreRendererService

        return api.snapshot
      })
    )
  )
  .pipe(Atom.keepAlive)
