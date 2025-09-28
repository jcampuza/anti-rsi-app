import { useState, useEffect } from 'react'
import type { AntiRsiRendererApi } from '../hooks/useAntiRsiApi'
import type { BreakConfig, AntiRsiConfig } from '../../../common/antirsi-core'

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
    <section className="config-panel">
      <h3>Timing Overrides</h3>
      <div className="config-grid">
        <label>
          Micro Pause Interval (s)
          <input
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
        <label>
          Micro Pause Duration (s)
          <input
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
        <label>
          Work Break Interval (s)
          <input
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
        <label>
          Work Break Duration (s)
          <input
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
        <label>
          Postpone Amount (s)
          <input
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
      <div className="config-actions">
        <button type="button" onClick={handleApply} className="primary" disabled={!api}>
          Apply Config
        </button>
        <button type="button" onClick={onReset}>
          Reset Defaults
        </button>
      </div>
    </section>
  )
}

export default ConfigPanel
