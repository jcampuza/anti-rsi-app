import { createFileRoute, Link } from "@tanstack/react-router"
import { Settings } from "lucide-react"
import { Versions } from "../components/Versions"
import BreakStatusCard from "../components/BreakStatusCard"
import { HeaderActions } from "../components/HeaderActions"
import logo from "../../../../resources/icon.png"
import { buttonVariants } from "@renderer/components/ui/Button"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { processAtom } from "@renderer/stores/antirsi"
import { configAtom, snapshotAtom } from "@renderer/stores/antirsi"
import useAntiRsiApi from "@renderer/hooks/useAntiRsiApi"

export const Route = createFileRoute("/")({
  component: App,
})

function Header() {
  return (
    <header className="app-region-no-drag flex items-center justify-between gap-6 text-foreground">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold h-12 w-12">
          <img src={logo} alt="AntiRSI" className="h-full w-full" />
        </h1>
      </div>

      <Link
        className={buttonVariants({
          variant: "link",
        })}
        to="/config"
      >
        <Settings className="h-5 w-5" />
      </Link>
    </header>
  )
}

function App() {
  const api = useAntiRsiApi()
  const snapshot = useAtomValue(snapshotAtom)
  const processes = useAtomValue(processAtom)
  const config = useAtomValue(configAtom)

  return Result.all([snapshot, processes, config]).pipe(
    Result.match({
      onInitial: () => {
        return <div>Loading AntiRSI…</div>
      },
      onFailure: () => {
        return <div>Error loading AntiRSI…</div>
      },
      onSuccess: (r) => {
        const [snapshot, processes, config] = r.value

        const pendingMini = config.mini.intervalSeconds - snapshot.timings.miniElapsed
        const pendingWork = config.work.intervalSeconds - snapshot.timings.workElapsed

        return (
          <div className="app-region-drag flex min-h-[520px] flex-col gap-4 rounded-2xl border border-border bg-background px-7 py-8">
            <Header />

            {snapshot.paused && processes.length > 0 && (
              <section>
                <p className="text-sm font-semibold text-accent">
                  Timers paused because of active processes: {processes.join(", ")}
                </p>
              </section>
            )}

            {snapshot.paused && processes.length === 0 && (
              <section>
                <p className="text-sm font-semibold text-accent">Timers paused</p>
              </section>
            )}

            <section
              className="grid gap-5 app-region-no-drag"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
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
      },
    }),
  )
}
