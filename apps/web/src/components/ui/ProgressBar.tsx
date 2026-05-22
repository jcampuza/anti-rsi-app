import { splitProps, type Component } from "solid-js"

interface ProgressBarProps {
  value: number
  max: number
  label: string
  class?: string
  animationMs?: number
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

export const ProgressBar: Component<ProgressBarProps> = (props) => {
  const [local] = splitProps(props, ["value", "max", "label", "class", "animationMs"])
  const safeMax = () => Math.max(local.max, 1)
  const safeValue = () => clamp(local.value, 0, safeMax())
  const percent = () => (safeValue() / safeMax()) * 100

  return (
    <div
      role="progressbar"
      aria-label={local.label}
      aria-valuemin={0}
      aria-valuemax={safeMax()}
      aria-valuenow={safeValue()}
      class={`progress-track ${local.class ?? ""}`.trim()}
    >
      <div
        class="progress-fill"
        style={{
          width: `${percent()}%`,
          "transition-duration": `${Math.max(local.animationMs ?? 50, 0)}ms`,
        }}
      />
    </div>
  )
}

export default ProgressBar
