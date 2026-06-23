import { createFileRoute } from "@tanstack/solid-router";
import { BreakOverlay } from "~/components/BreakOverlay";
import { useAntiRsi } from "~/context/antirsi";
import { useInterpolatedTimings } from "~/hooks/useInterpolatedTimings";
import { useOverlayMode } from "~/hooks/useOverlayMode";

export const Route = createFileRoute("/work-break")({
  component: WorkBreakPage,
});

function WorkBreakPage() {
  const antirsi = useAntiRsi();
  const timings = useInterpolatedTimings(
    antirsi.snapshot,
    antirsi.snapshotReceivedAt,
  );
  useOverlayMode({ isEnabled: true });

  return (
    <BreakOverlay
      snapshot={antirsi.snapshot()}
      config={antirsi.config()}
      timings={timings()}
      onPostpone={() => {
        antirsi.api.dispatch({ type: "POSTPONE_WORK_BREAK" });
      }}
      onSkip={() => {
        antirsi.api.dispatch({ type: "END_WORK_BREAK" });
      }}
    />
  );
}
