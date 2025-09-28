import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Versions } from '../components/Versions'
import BreakStatusCard from '../components/BreakStatusCard'
import ConfigPanel from '../components/ConfigPanel'
import { HeaderActions } from '../components/HeaderActions'
import useAntiRsi from '../hooks/useAntiRsi'
import useConfig from '../hooks/useConfig'
import { defaultConfig } from '../../../common/antirsi-core'
import logo from '../../../../resources/icon.png'

export const Route = createFileRoute('/')({
  component: App
})

function App(): React.JSX.Element {
  const { snapshot, api } = useAntiRsi()
  const config = useConfig()

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
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card px-6 py-10 text-muted-foreground shadow-lg">
        <p>Loading AntiRSI…</p>
      </div>
    )
  }

  const pendingMini = config.mini.intervalSeconds - snapshot.timings.miniElapsed
  const pendingWork = config.work.intervalSeconds - snapshot.timings.workElapsed

  return (
    <div className="app-region-drag flex min-h-[520px] flex-col gap-4 rounded-2xl border border-border bg-background px-7 py-8">
      <header className="app-region-no-drag flex items-start justify-between gap-6 text-foreground">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold h-16 w-16">
            <img src={logo} alt="AntiRSI" className="h-full w-full" />
          </h1>
        </div>
        <HeaderActions api={api} snapshot={snapshot} />
      </header>

      <section>
        <p className="text-muted-foreground">State: {snapshot.state}</p>
        {snapshot.paused ? (
          <p className="text-sm font-semibold text-accent">Timers paused</p>
        ) : null}
      </section>

      <section
        className="grid gap-5 app-region-no-drag"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
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
