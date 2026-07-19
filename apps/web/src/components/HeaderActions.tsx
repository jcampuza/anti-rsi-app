import type { AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core";
import { createSignal, Show, type Component } from "solid-js";
import { Button } from "~/components/ui/Button";
import { useDispatch } from "~/lib/api";

interface HeaderActionsProps {
  config: AntiRsiConfig;
  snapshot: AntiRsiSnapshot;
  disabled?: boolean;
}

export const HeaderActions: Component<HeaderActionsProps> = (props) => {
  const dispatch = useDispatch();
  const isPaused = () => props.snapshot.paused;
  const areWorkBreaksEnabled = () => props.config.work.enabled;

  const [errorMessage, setErrorMessage] = createSignal<string | undefined>(
    undefined,
  );

  const reportFailure = (message: string): void => {
    setErrorMessage(message);
    window.setTimeout(() => {
      setErrorMessage((current) => (current === message ? undefined : current));
    }, 4000);
  };

  const handleTriggerWorkBreak = (): void => {
    dispatch({ type: "START_WORK_BREAK", naturalContinuation: false }).catch(
      (error) => {
        console.error("[AntiRSI] Failed to trigger work break", error);
        reportFailure("Failed to start work break.");
      },
    );
  };

  const handleTriggerMicroPause = (): void => {
    dispatch({ type: "START_MINI_BREAK" }).catch((error) => {
      console.error("[AntiRSI] Failed to trigger micro pause", error);
      reportFailure("Failed to start micro pause.");
    });
  };

  const handlePostponeWorkBreak = (): void => {
    dispatch({ type: "POSTPONE_WORK_BREAK" }).catch((error) => {
      console.error("[AntiRSI] Failed to postpone work break", error);
      reportFailure("Failed to postpone work break.");
    });
  };

  const handleTogglePause = (): void => {
    const promise = dispatch({
      type: "SET_USER_PAUSED",
      value: !isPaused(),
    });

    promise
      .then(() => {
        console.info(`[AntiRSI] ${isPaused() ? "Resumed" : "Paused"} timers`);
      })
      .catch((error) => {
        console.error("[AntiRSI] Failed to toggle pause", error);
        reportFailure("Failed to toggle pause.");
      });
  };

  const handleResetTimings = (): void => {
    dispatch({ type: "RESET_TIMINGS" }).catch((error) => {
      console.error("[AntiRSI] Failed to reset timers", error);
      reportFailure("Failed to reset timers.");
    });
  };

  return (
    <div class="app-region-no-drag flex flex-col items-end gap-2">
      <Show when={errorMessage()}>
        {(message) => (
          <p class="text-xs font-medium text-destructive" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <div class="flex flex-wrap justify-end gap-3">
      {areWorkBreaksEnabled() ? (
        <Button
          type="button"
          variant="primary"
          onClick={handleTriggerWorkBreak}
          disabled={props.disabled}
        >
          Start Work Break
        </Button>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        onClick={handleTriggerMicroPause}
        disabled={props.disabled}
      >
        Micro Pause
      </Button>
      {areWorkBreaksEnabled() ? (
        <Button
          type="button"
          variant="secondary"
          onClick={handlePostponeWorkBreak}
          disabled={props.disabled}
        >
          Postpone Work Break
        </Button>
      ) : null}
      <Button type="button" variant="secondary" onClick={handleTogglePause}>
        {isPaused() ? "Resume Timers" : "Pause Timers"}
      </Button>
      <Button type="button" variant="secondary" onClick={handleResetTimings}>
        Reset Timers
      </Button>
      </div>
    </div>
  );
};
