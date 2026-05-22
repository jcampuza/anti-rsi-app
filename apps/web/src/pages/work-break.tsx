import { Show, type Component } from "solid-js"
import { BreakOverlay } from "~/components/BreakOverlay"
import { useAntiRsi } from "~/context/antirsi"
import { useOverlayMode } from "~/hooks/useOverlayMode"

const WorkBreakPage: Component = () => {
  const antirsi = useAntiRsi()
  useOverlayMode({ isEnabled: true })

  return (
    <Show
      when={!antirsi.loading() && antirsi.snapshot() && antirsi.config()}
      fallback={
        <Show
          when={antirsi.error()}
          fallback={<div>Loading snapshot or config for work break...</div>}
        >
          <div>Error loading snapshot or config for work break</div>
        </Show>
      }
    >
      <BreakOverlay
        snapshot={antirsi.snapshot()!}
        config={antirsi.config()!}
        onPostpone={() => {
          antirsi.api.dispatch({ type: "POSTPONE_WORK_BREAK" })
        }}
        onSkip={() => {
          antirsi.api.dispatch({ type: "END_WORK_BREAK" })
        }}
      />
    </Show>
  )
}

export default WorkBreakPage
