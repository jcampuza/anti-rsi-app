import { Outlet, createRootRoute } from "@tanstack/solid-router";
import { createEffect, createSignal } from "solid-js";
import { BreakOverlay } from "~/components/BreakOverlay";
import { BreakWarningToast } from "~/components/BreakWarningToast";
import { Header } from "~/components/Header";
import {
  AntiRsiBootstrap,
  AntiRsiProvider,
  useAntiRsi,
} from "~/context/antirsi";
import { useInterpolatedTimings } from "~/hooks/useInterpolatedTimings";
import { useOverlayMode } from "~/hooks/useOverlayMode";
import { hideTauriBreakOverlay } from "~/lib/tauri-overlay-manager";
import "~/assets/tailwind.css";

type OverlayKind = "mini" | "work";

const getOverlayKind = (): OverlayKind | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const overlay = new URLSearchParams(window.location.search).get("overlay");
  return overlay === "mini" || overlay === "work" ? overlay : null;
};

const isWarningRoute = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).has("warning");
};

function OverlayWindow(props: { kind: OverlayKind }) {
  const antirsi = useAntiRsi();
  const timings = useInterpolatedTimings(
    antirsi.snapshot,
    antirsi.snapshotReceivedAt,
  );
  const [acknowledged, setAcknowledged] = createSignal(false);
  useOverlayMode({ isEnabled: true });
  createEffect(() => {
    if (antirsi.snapshot().state === "normal") {
      hideTauriBreakOverlay();
    }
  });
  createEffect(() => {
    const state = antirsi.snapshot().state;
    const expectedPendingState =
      props.kind === "work" ? "pending-work" : "pending-mini";
    if (!acknowledged() && state === expectedPendingState) {
      setAcknowledged(true);
      antirsi.api.dispatch({
        type: "ACK_BREAK_VISIBLE",
        breakType: props.kind,
      });
    }
  });

  const overlayProps =
    props.kind === "work"
      ? {
          onPostpone: () => {
            antirsi.api.dispatch({ type: "POSTPONE_WORK_BREAK" });
          },
        }
      : {};

  return (
    <BreakOverlay
      snapshot={antirsi.snapshot()}
      config={antirsi.config()}
      timings={timings()}
      {...overlayProps}
      onSkip={() => {
        antirsi.api.dispatch(
          props.kind === "work"
            ? { type: "END_WORK_BREAK" }
            : { type: "END_MINI_BREAK" },
        );
      }}
    />
  );
}

function WarningWindow() {
  const antirsi = useAntiRsi();
  const timings = useInterpolatedTimings(
    antirsi.snapshot,
    antirsi.snapshotReceivedAt,
  );
  useOverlayMode({ isEnabled: true });
  const displaySeconds = () => {
    const warning = antirsi.snapshot().breakWarning;
    if (!warning) {
      return 0;
    }
    if (warning.phase === "waiting-for-activity-pause") {
      return warning.forcedStartInSeconds ?? 0;
    }
    const config = antirsi.config();
    const projected = timings();
    return warning.breakType === "work"
      ? Math.max(config.work.intervalSeconds - projected.workElapsed, 0)
      : Math.max(config.mini.intervalSeconds - projected.miniElapsed, 0);
  };

  return (
    <BreakWarningToast
      warning={antirsi.snapshot().breakWarning}
      displaySeconds={displaySeconds()}
    />
  );
}

function AppShell() {
  const overlayKind = getOverlayKind();
  const warningRoute = isWarningRoute();

  if (overlayKind) {
    return <OverlayWindow kind={overlayKind} />;
  }

  if (warningRoute) {
    return <WarningWindow />;
  }

  return (
    <div>
      <Header />
      <Outlet />
    </div>
  );
}

function RootLayout() {
  return (
    <AntiRsiProvider>
      <AntiRsiBootstrap>
        <AppShell />
      </AntiRsiBootstrap>
    </AntiRsiProvider>
  );
}

export const Route = createRootRoute({ component: RootLayout });
