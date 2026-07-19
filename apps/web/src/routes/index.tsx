import { useAtomValue } from "@effect/atom-solid";
import { createFileRoute } from "@tanstack/solid-router";
import { Show, createMemo } from "solid-js";
import BreakStatusCard from "~/components/BreakStatusCard";
import { HeaderActions } from "~/components/HeaderActions";
import { useInterpolatedTimings } from "~/hooks/useInterpolatedTimings";
import {
  configAtom,
  connectionStatusAtom,
  processesAtom,
  snapshotAtom,
  snapshotReceivedAtAtom,
} from "~/lib/app-state";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const snapshot = useAtomValue(() => snapshotAtom);
  const config = useAtomValue(() => configAtom);
  const processes = useAtomValue(() => processesAtom);
  const snapshotReceivedAt = useAtomValue(() => snapshotReceivedAtAtom);
  const connectionStatus = useAtomValue(() => connectionStatusAtom);
  const isConnected = () => connectionStatus() === "open";
  const timings = useInterpolatedTimings(
    snapshot,
    snapshotReceivedAt,
    isConnected,
  );

  const miniElapsed = () => timings().miniElapsed;
  const workElapsed = () => timings().workElapsed;

  const pendingMini = createMemo(() =>
    Math.max(0, config().mini.intervalSeconds - miniElapsed()),
  );

  const pendingWork = createMemo(() =>
    Math.max(0, config().work.intervalSeconds - workElapsed()),
  );

  return (
    <div class="app-region-drag flex min-h-[330px] flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-6">
      <Show when={snapshot().paused && processes().length > 0}>
        <section class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <p class="text-sm font-semibold text-accent">
            Timers paused because of active processes:{" "}
            {processes().join(", ")}
          </p>
        </section>
      </Show>

      <Show when={snapshot().paused && processes().length === 0}>
        <section class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <p class="text-sm font-semibold text-accent">Timers paused</p>
        </section>
      </Show>

      <section
        class="grid gap-5 app-region-no-drag"
        style={{
          "grid-template-columns": "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
        }}
      >
        <BreakStatusCard
          config={config()}
          snapshot={snapshot()}
          breakType="mini"
          pendingSeconds={pendingMini()}
        />
        <Show when={config().work.enabled}>
          <BreakStatusCard
            config={config()}
            snapshot={snapshot()}
            breakType="work"
            pendingSeconds={pendingWork()}
          />
        </Show>
      </section>

      <div class="mt-1 border-t border-white/[0.08] pt-4 sm:pt-5">
        <HeaderActions config={config()} snapshot={snapshot()} />
      </div>
    </div>
  );
}
