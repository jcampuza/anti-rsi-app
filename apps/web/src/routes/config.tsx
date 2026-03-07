import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import ConfigPanel from "../components/ConfigPanel"
import { buttonVariants } from "~/components/ui/Button"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { configAtom } from "~/stores/antirsi"
import { useAntiRsiApi } from "~/hooks/useAntiRsiApi"

export const Route = createFileRoute("/config")({
  component: ConfigRoute,
})

function ConfigRoute(): React.JSX.Element {
  const api = useAntiRsiApi()
  const config = useAtomValue(configAtom)

  const handleReset = (): void => {
    api
      .dispatch({ type: "RESET_CONFIG" })
      .catch((error) => console.error("[AntiRSI] Failed to reset config", error))
  }

  return Result.match(config, {
    onInitial: () => {
      return (
        <div className="flex items-center justify-center rounded-[28px] bg-card px-6 py-10 text-muted-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <p>Loading AntiRSI…</p>
        </div>
      )
    },
    onFailure: () => {
      return (
        <div className="flex items-center justify-center rounded-[28px] bg-card px-6 py-10 text-muted-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <p>Error loading AntiRSI…</p>
        </div>
      )
    },
    onSuccess: (r) => {
      return (
        <div className="app-region-drag flex min-h-[520px] flex-col gap-6 px-7 py-8">
          <header className="app-region-no-drag">
            <div className="flex items-center gap-3 mb-4">
              <Link to="/" className={buttonVariants({ variant: "link" })}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </div>
            <h1 className="text-3xl font-bold">Configuration</h1>
            <p className="text-muted-foreground">Adjust your break timing preferences</p>
          </header>

          <ConfigPanel config={r.value} api={api} onReset={handleReset} />
        </div>
      )
    },
  })
}
