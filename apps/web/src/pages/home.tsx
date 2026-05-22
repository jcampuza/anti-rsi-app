import { A } from "@solidjs/router"
import { Settings } from "lucide-solid"
import { Show, createMemo, type Component } from "solid-js"
import BreakStatusCard from "~/components/BreakStatusCard"
import { HeaderActions } from "~/components/HeaderActions"
import { Versions } from "~/components/Versions"
import { buttonVariants } from "~/components/ui/Button"
import { useAntiRsi } from "~/context/antirsi"



const HomePage: Component = () => {
  const antirsi = useAntiRsi()

  const pendingMini = createMemo(() => {
    const snapshot = antirsi.snapshot()
    const config = antirsi.config()
    if (!snapshot || !config) return 0
    return config.mini.intervalSeconds - snapshot.timings.miniElapsed
  })

  const pendingWork = createMemo(() => {
    const snapshot = antirsi.snapshot()
    const config = antirsi.config()
    if (!snapshot || !config) return 0
    return config.work.intervalSeconds - snapshot.timings.workElapsed
  })

  return (
    <Show
      when={!antirsi.loading() && antirsi.ready()}
      fallback={
        <Show
          when={antirsi.error()}
          fallback={<div>Loading AntiRSI…</div>}
        >
          <div>Error loading AntiRSI…</div>
        </Show>
      }
    >
      <div class="app-region-drag flex min-h-[520px] flex-col gap-6 px-7 py-8">


        <Show when={antirsi.snapshot()?.paused && antirsi.processes().length > 0}>
          <section class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
            <p class="text-sm font-semibold text-accent">
              Timers paused because of active processes: {antirsi.processes().join(", ")}
            </p>
          </section>
        </Show>

        <Show when={antirsi.snapshot()?.paused && antirsi.processes().length === 0}>
          <section class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
            <p class="text-sm font-semibold text-accent">Timers paused</p>
          </section>
        </Show>

        <section
          class="grid gap-5 app-region-no-drag"
          style={{ "grid-template-columns": "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          <BreakStatusCard
            config={antirsi.config()!}
            snapshot={antirsi.snapshot()!}
            breakType="mini"
            pendingSeconds={pendingMini()}
          />
          <Show when={antirsi.config()?.work.enabled}>
            <BreakStatusCard
              config={antirsi.config()!}
              snapshot={antirsi.snapshot()!}
              breakType="work"
              pendingSeconds={pendingWork()}
            />
          </Show>
        </section>

        <div class="mt-2 border-t border-white/[0.08] pt-6">
          <HeaderActions
            api={antirsi.api}
            config={antirsi.config()!}
            snapshot={antirsi.snapshot()!}
          />
        </div>

        <Show when={import.meta.env.DEV}>
          <Versions />
        </Show>
      </div>
    </Show>
  )
}

export default HomePage
