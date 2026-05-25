import { createFileRoute } from "@tanstack/solid-router";
import { Show, createMemo } from "solid-js";
import BreakStatusCard from "~/components/BreakStatusCard";
import { HeaderActions } from "~/components/HeaderActions";
import { Versions } from "~/components/Versions";
import { useAntiRsi } from "~/context/antirsi";
import { useInterpolatedTimings } from "~/hooks/useInterpolatedTimings";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const antirsi = useAntiRsi();
  const timings = useInterpolatedTimings(antirsi.snapshot);

  const miniElapsed = () => timings().miniElapsed;
  const workElapsed = () => timings().workElapsed;

  const pendingMini = createMemo(() => {
    const config = antirsi.config();
    return Math.max(0, config.mini.intervalSeconds - miniElapsed());
  });

  const pendingWork = createMemo(() => {
    const config = antirsi.config();
    return Math.max(0, config.work.intervalSeconds - workElapsed());
  });

  return (
    <div class="app-region-drag flex min-h-[520px] flex-col gap-6 px-7 py-8">
      <Show
        when={antirsi.snapshot().paused && antirsi.processes().length > 0}
      >
        <section class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <p class="text-sm font-semibold text-accent">
            Timers paused because of active processes:{" "}
            {antirsi.processes().join(", ")}
          </p>
        </section>
      </Show>

      <Show
        when={antirsi.snapshot().paused && antirsi.processes().length === 0}
      >
        <section class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
          <p class="text-sm font-semibold text-accent">Timers paused</p>
        </section>
      </Show>

      <section
        class="grid gap-5 app-region-no-drag"
        style={{
          "grid-template-columns": "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        <BreakStatusCard
          config={antirsi.config()}
          snapshot={antirsi.snapshot()}
          breakType="mini"
          pendingSeconds={pendingMini()}
        />
        <Show when={antirsi.config().work.enabled}>
          <BreakStatusCard
            config={antirsi.config()}
            snapshot={antirsi.snapshot()}
            breakType="work"
            pendingSeconds={pendingWork()}
          />
        </Show>
      </section>

      <div class="mt-2 border-t border-white/[0.08] pt-6">
        <HeaderActions
          api={antirsi.api}
          config={antirsi.config()}
          snapshot={antirsi.snapshot()}
        />
      </div>

      <Show when={import.meta.env.DEV}>
        <Versions />
      </Show>
    </div>
  );
}
