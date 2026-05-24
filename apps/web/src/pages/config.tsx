import { A } from "@solidjs/router"
import { ArrowLeft } from "lucide-solid"
import { Show, type Component } from "solid-js"
import { ConfigPanel } from "~/components/ConfigPanel"
import { buttonVariants } from "~/components/ui/Button"
import { useAntiRsi } from "~/context/antirsi"

const ConfigPage: Component = () => {
  const antirsi = useAntiRsi()

  const handleReset = (): void => {
    antirsi.api
      .dispatch({ type: "RESET_CONFIG" })
      .catch((error) => console.error("[AntiRSI] Failed to reset config", error))
  }

  return (
    <Show
      when={!antirsi.loading() && antirsi.config()}
      fallback={
        <Show
          when={antirsi.error()}
          fallback={
            <div class="flex items-center justify-center rounded-[28px] bg-card px-6 py-10 text-muted-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <p>Loading AntiRSI…</p>
            </div>
          }
        >
          <div class="flex items-center justify-center rounded-[28px] bg-card px-6 py-10 text-muted-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <p>Error loading AntiRSI…</p>
          </div>
        </Show>
      }
    >
      <div class="app-region-drag flex min-h-[520px] flex-col gap-6 px-7 py-8">
        <header class="app-region-no-drag">
          <div class="mb-4 flex items-center gap-3">
            <A href="/" class={buttonVariants({ variant: "link" })}>
              <ArrowLeft class="h-5 w-5" />
            </A>
          </div>
          <h1 class="text-3xl font-bold">Configuration</h1>
          <p class="text-muted-foreground">Adjust your break timing preferences</p>
        </header>

        <ConfigPanel config={antirsi.config()!} api={antirsi.api} onReset={handleReset} />
      </div>
    </Show>
  )
}

export default ConfigPage
