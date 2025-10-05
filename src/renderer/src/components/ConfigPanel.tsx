import { useState, useEffect } from 'react'
import type { AntiRsiRendererApi } from '../hooks/useAntiRsiApi'
import type { BreakConfig, AntiRsiConfig } from '../../../common/antirsi-core'
import { Button } from '@renderer/components/ui/Button'

interface ConfigPanelProps {
  config: AntiRsiConfig
  api: AntiRsiRendererApi | undefined
  onReset: () => void
}

const ConfigPanel = ({ config, api, onReset }: ConfigPanelProps): React.JSX.Element => {
  const [miniConfig, setMiniConfig] = useState<BreakConfig>(() => ({ ...config.mini }))
  const [workConfig, setWorkConfig] = useState({
    intervalSeconds: config.work.intervalSeconds,
    durationSeconds: config.work.durationSeconds,
    postponeSeconds: config.work.postponeSeconds
  })

  useEffect(() => {
    setMiniConfig({ ...config.mini })
    setWorkConfig({
      intervalSeconds: config.work.intervalSeconds,
      durationSeconds: config.work.durationSeconds,
      postponeSeconds: config.work.postponeSeconds
    })
  }, [config])

  const handleApply = (): void => {
    if (!api) return
    api
      .setConfig({
        mini: miniConfig,
        work: workConfig
      })
      .catch((error) => console.error('[AntiRSI] Failed to update config', error))
  }

  return (
    <section className="app-region-no-drag flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-foreground shadow">
      <h3 className="text-lg font-semibold">Timing Overrides</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Micro Pause Interval (s)
          <input
            className="input"
            type="number"
            min={30}
            value={miniConfig.intervalSeconds}
            onChange={(event) =>
              setMiniConfig({
                ...miniConfig,
                intervalSeconds: Number.parseInt(event.target.value, 10)
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Micro Pause Duration (s)
          <input
            className="input"
            type="number"
            min={3}
            value={miniConfig.durationSeconds}
            onChange={(event) =>
              setMiniConfig({
                ...miniConfig,
                durationSeconds: Number.parseInt(event.target.value, 10)
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Work Break Interval (s)
          <input
            className="input"
            type="number"
            min={60}
            value={workConfig.intervalSeconds}
            onChange={(event) =>
              setWorkConfig({
                ...workConfig,
                intervalSeconds: Number.parseInt(event.target.value, 10)
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Work Break Duration (s)
          <input
            className="input"
            type="number"
            min={60}
            value={workConfig.durationSeconds}
            onChange={(event) =>
              setWorkConfig({
                ...workConfig,
                durationSeconds: Number.parseInt(event.target.value, 10)
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Postpone Amount (s)
          <input
            className="input"
            type="number"
            min={60}
            value={workConfig.postponeSeconds}
            onChange={(event) =>
              setWorkConfig({
                ...workConfig,
                postponeSeconds: Number.parseInt(event.target.value, 10)
              })
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" onClick={handleApply} disabled={!api}>
          Apply Config
        </Button>
        <Button type="button" variant="secondary" onClick={onReset}>
          Reset Defaults
        </Button>
      </div>
    </section>
  )
}

export default ConfigPanel
