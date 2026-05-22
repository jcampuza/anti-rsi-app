import type { AntiRsiConfig, AppearanceConfig, BreakConfig, WorkBreakConfig } from "@antirsi/core"
import { createEffect, createSignal, type Component } from "solid-js"
import type { AntiRsiRendererApi } from "~/context/antirsi"
import { Button } from "~/components/ui/Button"

interface ConfigPanelProps {
  config: AntiRsiConfig
  api: AntiRsiRendererApi
  onReset: () => void
}

export const ConfigPanel: Component<ConfigPanelProps> = (props) => {
  const [miniConfig, setMiniConfig] = createSignal<BreakConfig>({ ...props.config.mini })
  const [workConfig, setWorkConfig] = createSignal<WorkBreakConfig>({ ...props.config.work })
  const [appearanceConfig, setAppearanceConfig] = createSignal<AppearanceConfig>({
    ...props.config.appearance,
  })

  createEffect(() => {
    setMiniConfig({ ...props.config.mini })
    setWorkConfig({ ...props.config.work })
    setAppearanceConfig({ ...props.config.appearance })
  })

  const handleApply = (): void => {
    props.api
      .dispatch({
        type: "SET_CONFIG",
        config: {
          mini: miniConfig(),
          work: workConfig(),
          appearance: appearanceConfig(),
        },
      })
      .catch((error) => console.error("[AntiRSI] Failed to update config", error))
  }

  return (
    <div class="app-region-no-drag flex flex-col gap-5">
      <section class="flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-card p-5 text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.04]">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold">Timing Overrides</h3>
          <p class="text-sm text-muted-foreground">
            Adjust when breaks start and how long they last.
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label class="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            <input
              class="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              type="checkbox"
              checked={workConfig().enabled}
              onChange={(event) =>
                setWorkConfig({
                  ...workConfig(),
                  enabled: event.currentTarget.checked,
                })
              }
            />
            <span class="space-y-1">
              <span class="block font-semibold text-foreground">Enable work breaks</span>
              <span class="block">Turn this off to keep only micro pauses active.</span>
            </span>
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            Micro Pause Interval (s)
            <input
              class="input"
              type="number"
              min={30}
              value={miniConfig().intervalSeconds}
              onInput={(event) =>
                setMiniConfig({
                  ...miniConfig(),
                  intervalSeconds: Number.parseInt(event.currentTarget.value, 10),
                })
              }
            />
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            Micro Pause Duration (s)
            <input
              class="input"
              type="number"
              min={3}
              value={miniConfig().durationSeconds}
              onInput={(event) =>
                setMiniConfig({
                  ...miniConfig(),
                  durationSeconds: Number.parseInt(event.currentTarget.value, 10),
                })
              }
            />
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            Work Break Interval (s)
            <input
              class="input"
              type="number"
              min={60}
              disabled={!workConfig().enabled}
              value={workConfig().intervalSeconds}
              onInput={(event) =>
                setWorkConfig({
                  ...workConfig(),
                  intervalSeconds: Number.parseInt(event.currentTarget.value, 10),
                })
              }
            />
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            Work Break Duration (s)
            <input
              class="input"
              type="number"
              min={60}
              disabled={!workConfig().enabled}
              value={workConfig().durationSeconds}
              onInput={(event) =>
                setWorkConfig({
                  ...workConfig(),
                  durationSeconds: Number.parseInt(event.currentTarget.value, 10),
                })
              }
            />
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            Postpone Amount (s)
            <input
              class="input"
              type="number"
              min={60}
              disabled={!workConfig().enabled}
              value={workConfig().postponeSeconds}
              onInput={(event) =>
                setWorkConfig({
                  ...workConfig(),
                  postponeSeconds: Number.parseInt(event.currentTarget.value, 10),
                })
              }
            />
          </label>
        </div>
      </section>

      <section class="flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-card p-5 text-foreground shadow-[0_18px_40px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.04]">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold">Appearance</h3>
        </div>

        <label class="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-sm text-muted-foreground">
          <input
            class="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
            type="checkbox"
            checked={appearanceConfig().translucentWindows}
            onChange={(event) =>
              setAppearanceConfig({
                translucentWindows: event.currentTarget.checked,
              })
            }
          />
          <span class="space-y-1">
            <span class="block font-semibold text-foreground">Translucent windows</span>
            <span class="block">
              Apply a subtle window translucency for the main desktop and break windows.
            </span>
          </span>
        </label>
      </section>

      <div class="flex flex-wrap gap-3">
        <Button type="button" variant="primary" onClick={handleApply}>
          Apply Settings
        </Button>
        <Button type="button" variant="secondary" onClick={props.onReset}>
          Reset Defaults
        </Button>
      </div>
    </div>
  )
}
