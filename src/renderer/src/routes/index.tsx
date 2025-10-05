import { createFileRoute, Link } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { Versions } from '../components/Versions'
import BreakStatusCard from '../components/BreakStatusCard'
import { HeaderActions } from '../components/HeaderActions'
import { useAntiRsi } from '../hooks/useAntiRsi'
import { useConfig } from '../hooks/useConfig'
import logo from '../../../../resources/icon.png'
import { buttonVariants } from '@renderer/components/ui/Button'
import useProcesses from '@renderer/hooks/useProcesses'

export const Route = createFileRoute('/')({
  component: App
})

function App() {
  const { snapshot, api } = useAntiRsi()
  const processes = useProcesses()
  const config = useConfig()

  if (!snapshot || !config) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card px-6 py-10 text-muted-foreground shadow-lg">
        <p>Loading AntiRSI…</p>
      </div>
    )
  }

  const pendingMini = config.mini.intervalSeconds - snapshot.timings.miniElapsed
  const pendingWork = config.work.intervalSeconds - snapshot.timings.workElapsed

  const renderTimersPaused = () => {
    if (snapshot.paused) {
      if (processes.length > 0) {
        return (
          <section>
            <p className="text-sm font-semibold text-accent">
              Timers paused because of active processes: {processes.join(', ')}
            </p>
          </section>
        )
      }

      return (
        <section>
          <p className="text-sm font-semibold text-accent">Timers paused</p>
        </section>
      )
    }

    return null
  }

  return (
    <div className="app-region-drag flex min-h-[520px] flex-col gap-4 rounded-2xl border border-border bg-background px-7 py-8">
      <header className="app-region-no-drag flex items-center justify-between gap-6 text-foreground">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold h-12 w-12">
            <img src={logo} alt="AntiRSI" className="h-full w-full" />
          </h1>
        </div>
        <Link
          className={buttonVariants({
            variant: 'link'
          })}
          to="/config"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </header>

      {renderTimersPaused()}

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

      <div className="mt-6">
        <HeaderActions api={api} snapshot={snapshot} />
      </div>

      {import.meta.env.DEV ? <Versions /> : null}
    </div>
  )
}
