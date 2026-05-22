import { Show, type Component } from "solid-js"
import { BreakOverlay } from "~/components/BreakOverlay"
import { useAntiRsi } from "~/context/antirsi"
import { useOverlayMode } from "~/hooks/useOverlayMode"

const MicroBreakPage: Component = () => {
  const antirsi = useAntiRsi()
  useOverlayMode({ isEnabled: true })

  return (
    <Show
      when={!antirsi.loading() && antirsi.snapshot() && antirsi.config()}
      fallback={
        <Show
          when={antirsi.error()}
          fallback={<div>Loading snapshot or config for micro break...</div>}
        >
          <div>Error loading snapshot or config for micro break</div>
        </Show>
      }
    >
      <BreakOverlay
        snapshot={antirsi.snapshot()!}
        config={antirsi.config()!}
        onSkip={() => {
          antirsi.api.dispatch({ type: "END_MINI_BREAK" })
        }}
      />
    </Show>
  )
}

export default MicroBreakPage
