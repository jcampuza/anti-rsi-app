import { Chunk, Effect, Stream } from 'effect'
import { Atom } from '@effect-atom/atom-react'
import { MainEvent } from 'src/common/actions'

const mainEventStream = Stream.async<MainEvent>((emit) => {
  const unsubscribe = window.api.antirsi.subscribeAll((payload) => {
    emit(Effect.succeed(Chunk.of(payload)))
  })
  return Effect.sync(() => unsubscribe())
})

const snapshotStream = mainEventStream.pipe(
  Stream.filter((payload) => payload.type === 'antirsi' || payload.type === 'init'),
  Stream.map((payload) => (payload.type === 'init' ? payload.snapshot : payload.snapshot))
)

const configStream = mainEventStream.pipe(
  Stream.filter((payload) => payload.type === 'config-changed' || payload.type === 'init'),
  Stream.map((payload) => (payload.type === 'init' ? payload.config : payload.config))
)

const processStream = mainEventStream.pipe(
  Stream.filter((payload) => payload.type === 'processes-updated' || payload.type === 'init'),
  Stream.map((payload) => (payload.type === 'init' ? payload.processes : payload.list))
)

export const configAtom = Atom.make(configStream)

export const snapshotAtom = Atom.make(snapshotStream)

export const processAtom = Atom.make(processStream)
