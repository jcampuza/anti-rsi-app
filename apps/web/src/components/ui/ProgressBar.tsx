interface ProgressBarProps {
  value: number
  max: number
  label: string
  className?: string
  animationMs?: number
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

export function ProgressBar({
  value,
  max,
  label,
  className,
  animationMs = 600,
}: ProgressBarProps): React.JSX.Element {
  const safeMax = Math.max(max, 1)
  const safeValue = clamp(value, 0, safeMax)
  const percent = (safeValue / safeMax) * 100

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      className={`progress-track ${className ?? ""}`.trim()}
    >
      <div
        className="progress-fill"
        style={{
          width: `${percent}%`,
          transitionDuration: `${Math.max(animationMs, 0)}ms`,
        }}
      />
    </div>
  )
}

export default ProgressBar
