import { Atom } from '@effect-atom/atom-react'
import { Chunk, Effect, Stream } from 'effect'
import { ProcessesService } from '@renderer/utils/anti-rsi-layer'
import { storeRuntime } from '@renderer/stores/antirsi'

const processStream = Effect.gen(function* () {
  const api = yield* ProcessesService

  return Stream.concat(
    Stream.fromEffect(
      Effect.promise(() => api.getProcesses()).pipe(Effect.map((r) => (r === undefined ? [] : r)))
    ),
    Stream.async<string[]>((emit) => {
      const unsubscribe = api.subscribe((list) => {
        emit(Effect.succeed(Chunk.of(list)))
      })
      return Effect.sync(() => unsubscribe())
    })
  )
}).pipe(Stream.unwrap)

export const processAtom = storeRuntime.atom(processStream).pipe(Atom.keepAlive)
