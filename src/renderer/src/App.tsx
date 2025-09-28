import { useEffect } from 'react'
import { Versions } from './components/Versions'
import BreakStatusCard from './components/BreakStatusCard'
import BreakOverlay from './components/BreakOverlay'
import ConfigPanel from './components/ConfigPanel'
import { HeaderActions } from './components/HeaderActions'
import useAntiRsi from './hooks/useAntiRsi'
import useIsOverlayWindow from './hooks/useIsOverlayWindow'
import useConfig from './hooks/useConfig'
import { defaultConfig } from '../../common/antirsi-core'

function App(): React.JSX.Element {
  const { snapshot, api } = useAntiRsi()
  const config = useConfig()
  const isOverlayWindow = useIsOverlayWindow()

  useEffect(() => {
    document.body.classList.toggle('overlay-mode', isOverlayWindow)
  }, [isOverlayWindow])

  const handleReset = (): void => {
    if (!api) {
      return
    }
    const defaults = defaultConfig()
    api
      .setConfig(defaults)
      .catch((error) => console.error('[AntiRSI] Failed to reset config', error))
  }

  if (!snapshot || !config) {
    return (
      <div className="app-shell">
        <p>Loading AntiRSI…</p>
      </div>
    )
  }

  const pendingMini = config.mini.intervalSeconds - snapshot.timings.miniElapsed
  const pendingWork = config.work.intervalSeconds - snapshot.timings.workElapsed

  if (isOverlayWindow) {
    return (
      <BreakOverlay
        snapshot={snapshot}
        config={config}
        onPostpone={() => api?.postponeWorkBreak()}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>AntiRSI</h1>
          <p>State: {snapshot.state}</p>
          {snapshot.paused ? <p className="paused-indicator">Timers paused</p> : null}
        </div>
        <HeaderActions api={api} snapshot={snapshot} />
      </header>

      <section className="status-grid">
        <BreakStatusCard
          config={config}
          snapshot={snapshot}
          breakType="mini"
          pendingSeconds={pendingMini}
        />
        <BreakStatusCard
          config={config}
          snapshot={snapshot}
          breakType="work"
          pendingSeconds={pendingWork}
        />
      </section>

      <ConfigPanel config={config} api={api} onReset={handleReset} />

      {import.meta.env.DEV ? <Versions /> : null}
    </div>
  )
}

export default App
