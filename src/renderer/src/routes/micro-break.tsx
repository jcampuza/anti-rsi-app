import { createFileRoute } from '@tanstack/react-router'
import { useAntiRsi } from '../hooks/useAntiRsi'
import { useConfig } from '../hooks/useConfig'
import { useOverlayMode } from '../hooks/useOverlayMode'
import BreakOverlay from '../components/BreakOverlay'

export const Route = createFileRoute('/micro-break')({
  component: MicroBreakRoute
})

function MicroBreakRoute(): React.JSX.Element {
  const { snapshot } = useAntiRsi()
  const config = useConfig()

  useOverlayMode({ isEnabled: true })

  if (!snapshot || !config) {
    return <div />
  }

  return <BreakOverlay snapshot={snapshot} config={config} />
}
