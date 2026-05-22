import type { AntiRsiConfig, AntiRsiSnapshot } from "@antirsi/core";
import { type Component } from "solid-js";
import type { AntiRsiRendererApi } from "~/context/antirsi";
import { Button } from "~/components/ui/Button";

interface HeaderActionsProps {
  api: AntiRsiRendererApi;
  config: AntiRsiConfig;
  snapshot: AntiRsiSnapshot;
  disabled?: boolean;
}

export const HeaderActions: Component<HeaderActionsProps> = (props) => {
  const isPaused = () => props.snapshot.paused;
  const areWorkBreaksEnabled = () => props.config.work.enabled;

  const handleTriggerWorkBreak = (): void => {
    props.api
      .dispatch({ type: "START_WORK_BREAK", naturalContinuation: false })
      .catch((error) => {
        console.error("[AntiRSI] Failed to trigger work break", error);
      });
  };

  const handleTriggerMicroPause = (): void => {
    props.api.dispatch({ type: "START_MINI_BREAK" }).catch((error) => {
      console.error("[AntiRSI] Failed to trigger micro pause", error);
    });
  };

  const handlePostponeWorkBreak = (): void => {
    props.api.dispatch({ type: "POSTPONE_WORK_BREAK" }).catch((error) => {
      console.error("[AntiRSI] Failed to postpone work break", error);
    });
  };

  const handleTogglePause = (): void => {
    const promise = props.api.dispatch({
      type: "SET_USER_PAUSED",
      value: !isPaused(),
    });

    promise
      .then(() => {
        console.info(`[AntiRSI] ${isPaused() ? "Resumed" : "Paused"} timers`);
      })
      .catch((error) => {
        console.error("[AntiRSI] Failed to toggle pause", error);
      });
  };

  const handleResetTimings = (): void => {
    props.api
      .dispatch({ type: "RESET_TIMINGS" })
      .catch((error) =>
        console.error("[AntiRSI] Failed to reset timers", error),
      );
  };

  return (
    <div class="app-region-no-drag flex flex-wrap justify-end gap-3">
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
  );
};
