import { createFileRoute } from "@tanstack/solid-router";
import { BreakOverlay } from "~/components/BreakOverlay";
import { useAntiRsi } from "~/context/antirsi";
import { useInterpolatedTimings } from "~/hooks/useInterpolatedTimings";
import { useOverlayMode } from "~/hooks/useOverlayMode";

export const Route = createFileRoute("/micro-break")({
  component: MicroBreakPage,
});

function MicroBreakPage() {
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
      onSkip={() => {
        antirsi.api.dispatch({ type: "END_MINI_BREAK" });
      }}
    />
  );
}
