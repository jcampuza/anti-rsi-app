import { createFileRoute } from "@tanstack/react-router"
import { useOverlayMode } from "../hooks/useOverlayMode"
import BreakOverlay from "../components/BreakOverlay"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { configAtom, snapshotAtom } from "@renderer/stores/antirsi"
import useAntiRsiApi from "@renderer/hooks/useAntiRsiApi"

export const Route = createFileRoute("/micro-break")({
  component: MicroBreakRoute,
})

function MicroBreakRoute(): React.JSX.Element {
  const snapshot = useAtomValue(snapshotAtom)
  const config = useAtomValue(configAtom)
  const api = useAntiRsiApi()

  useOverlayMode({ isEnabled: true })

  return Result.all([snapshot, config]).pipe(
    Result.match({
      onInitial: () => {
        return <div>Loading snapshot or config for micro break...</div>
      },
      onFailure: () => {
        return <div>Error loading snapshot or config for micro break</div>
      },
      onSuccess: (r) => {
        const [snapshot, config] = r.value
        return (
          <BreakOverlay
            snapshot={snapshot}
            config={config}
            onSkip={() => api.dispatch({ type: "END_MINI_BREAK" })}
          />
        )
      },
    }),
  )
}
