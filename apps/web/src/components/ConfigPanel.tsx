import type { AntiRsiConfig, BreakConfig, WorkBreakConfig } from "@antirsi/core";
import { createEffect, createSignal, Show, type Component } from "solid-js";
import { Button } from "~/components/ui/Button";
import { useDispatch } from "~/lib/api";

interface ConfigPanelProps {
  config: AntiRsiConfig;
  onReset: () => void;
  class?: string;
}

export const ConfigPanel: Component<ConfigPanelProps> = (props) => {
  const dispatch = useDispatch();
  const [miniConfig, setMiniConfig] = createSignal<BreakConfig>({
    ...props.config.mini,
  });
  const [workConfig, setWorkConfig] = createSignal<WorkBreakConfig>({
    ...props.config.work,
  });
  const [breakWarningLeadSeconds, setBreakWarningLeadSeconds] = createSignal(
    props.config.breakWarningLeadSeconds,
  );
  const [
    waitForActivityPauseBeforeBreak,
    setWaitForActivityPauseBeforeBreak,
  ] = createSignal(props.config.waitForActivityPauseBeforeBreak);
  const [breakStartGraceSeconds, setBreakStartGraceSeconds] = createSignal(
    props.config.breakStartGraceSeconds,
  );
  const [maxBreakStartDelaySeconds, setMaxBreakStartDelaySeconds] =
    createSignal(props.config.maxBreakStartDelaySeconds);
  const [invalidFields, setInvalidFields] = createSignal<Set<string>>(
    new Set(),
  );
  const hasInvalidField = () => invalidFields().size > 0;
  const [applyError, setApplyError] = createSignal(false);

  const markFieldValid = (field: string, valid: boolean): void => {
    setInvalidFields((prev) => {
      const next = new Set(prev);
      if (valid) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  /**
   * Parses a numeric input value, guarding against NaN/non-finite values.
   * Returns the previous value unchanged (leaving state untouched) and flags
   * the field as invalid instead of writing NaN into state; the Apply button
   * is disabled while any field is invalid.
   */
  const parseIntGuarded = (
    field: string,
    value: string,
    previous: number,
  ): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      markFieldValid(field, false);
      return previous;
    }
    markFieldValid(field, true);
    return parsed;
  };

  createEffect(() => {
    setMiniConfig({ ...props.config.mini });
    setWorkConfig({ ...props.config.work });
    setBreakWarningLeadSeconds(props.config.breakWarningLeadSeconds);
    setWaitForActivityPauseBeforeBreak(
      props.config.waitForActivityPauseBeforeBreak,
    );
    setBreakStartGraceSeconds(props.config.breakStartGraceSeconds);
    setMaxBreakStartDelaySeconds(props.config.maxBreakStartDelaySeconds);
  });

  const handleApply = (): void => {
    if (hasInvalidField()) {
      return;
    }
    setApplyError(false);
    dispatch({
      type: "SET_CONFIG",
      config: {
        mini: miniConfig(),
        work: workConfig(),
        breakWarningLeadSeconds: breakWarningLeadSeconds(),
        waitForActivityPauseBeforeBreak: waitForActivityPauseBeforeBreak(),
        breakStartGraceSeconds: breakStartGraceSeconds(),
        maxBreakStartDelaySeconds: maxBreakStartDelaySeconds(),
      },
    }).catch((error) => {
      console.error("[AntiRSI] Failed to update config", error);
      setApplyError(true);
      window.setTimeout(() => setApplyError(false), 4000);
    });
  };

  return (
    <div class={`app-region-no-drag flex flex-col gap-5 ${props.class}`}>
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
              <span class="block font-semibold text-foreground">
                Enable work breaks
              </span>
              <span class="block">
                Turn this off to keep only micro pauses active.
              </span>
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
                  intervalSeconds: parseIntGuarded(
                    "mini.intervalSeconds",
                    event.currentTarget.value,
                    miniConfig().intervalSeconds,
                  ),
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
                  durationSeconds: parseIntGuarded(
                    "mini.durationSeconds",
                    event.currentTarget.value,
                    miniConfig().durationSeconds,
                  ),
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
                  intervalSeconds: parseIntGuarded(
                    "work.intervalSeconds",
                    event.currentTarget.value,
                    workConfig().intervalSeconds,
                  ),
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
                  durationSeconds: parseIntGuarded(
                    "work.durationSeconds",
                    event.currentTarget.value,
                    workConfig().durationSeconds,
                  ),
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
                  postponeSeconds: parseIntGuarded(
                    "work.postponeSeconds",
                    event.currentTarget.value,
                    workConfig().postponeSeconds,
                  ),
                })
              }
            />
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            Warning Lead Time (s)
            <input
              class="input"
              type="number"
              min={0}
              value={breakWarningLeadSeconds()}
              onInput={(event) =>
                setBreakWarningLeadSeconds(
                  parseIntGuarded(
                    "breakWarningLeadSeconds",
                    event.currentTarget.value,
                    breakWarningLeadSeconds(),
                  ),
                )
              }
            />
          </label>
          <label class="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-sm text-muted-foreground sm:col-span-2">
            <input
              class="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              type="checkbox"
              checked={waitForActivityPauseBeforeBreak()}
              onChange={(event) =>
                setWaitForActivityPauseBeforeBreak(
                  event.currentTarget.checked,
                )
              }
            />
            <span class="space-y-1">
              <span class="block font-semibold text-foreground">
                Wait for a pause in typing or mouse movement
              </span>
              <span class="block">
                Breaks can wait briefly for a quiet moment before the full
                overlay appears.
              </span>
            </span>
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            Activity Pause Needed (s)
            <input
              class="input"
              type="number"
              min={0}
              disabled={!waitForActivityPauseBeforeBreak()}
              value={breakStartGraceSeconds()}
              onInput={(event) =>
                setBreakStartGraceSeconds(
                  parseIntGuarded(
                    "breakStartGraceSeconds",
                    event.currentTarget.value,
                    breakStartGraceSeconds(),
                  ),
                )
              }
            />
          </label>
          <label class="flex flex-col gap-1 text-sm text-muted-foreground">
            Max Activity Delay (s)
            <input
              class="input"
              type="number"
              min={0}
              disabled={!waitForActivityPauseBeforeBreak()}
              value={maxBreakStartDelaySeconds()}
              onInput={(event) =>
                setMaxBreakStartDelaySeconds(
                  parseIntGuarded(
                    "maxBreakStartDelaySeconds",
                    event.currentTarget.value,
                    maxBreakStartDelaySeconds(),
                  ),
                )
              }
            />
          </label>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={handleApply}
            disabled={hasInvalidField()}
          >
            Apply Settings
          </Button>
          <Button type="button" variant="secondary" onClick={props.onReset}>
            Reset Defaults
          </Button>
          <Show when={hasInvalidField()}>
            <p class="text-xs font-medium text-destructive" role="alert">
              Enter a valid number before applying.
            </p>
          </Show>
          <Show when={applyError()}>
            <p class="text-xs font-medium text-destructive" role="alert">
              Failed to apply settings. Please try again.
            </p>
          </Show>
        </div>
      </section>
    </div>
  );
};
