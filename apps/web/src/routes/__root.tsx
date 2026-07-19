import { useAtomValue } from "@effect/atom-solid";
import { RegistryProvider } from "@effect/atom-solid";
import { Outlet, createRootRoute } from "@tanstack/solid-router";
import { createEffect, createSignal } from "solid-js";
import { AntiRsiGate } from "~/components/AntiRsiGate";
import { BreakOverlay } from "~/components/BreakOverlay";
import { BreakWarningToast } from "~/components/BreakWarningToast";
import { Header } from "~/components/Header";
import { useInterpolatedTimings } from "~/hooks/useInterpolatedTimings";
import { useOverlayMode } from "~/hooks/useOverlayMode";
import { useDispatch } from "~/lib/api";
import {
  configAtom,
  connectionStatusAtom,
  snapshotAtom,
  snapshotReceivedAtAtom,
} from "~/lib/app-state";
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
  const snapshot = useAtomValue(() => snapshotAtom);
  const config = useAtomValue(() => configAtom);
  const snapshotReceivedAt = useAtomValue(() => snapshotReceivedAtAtom);
  const connectionStatus = useAtomValue(() => connectionStatusAtom);
  const dispatch = useDispatch();
  const timings = useInterpolatedTimings(
    snapshot,
    snapshotReceivedAt,
    () => connectionStatus() === "open",
  );
  const [acknowledgedKind, setAcknowledgedKind] =
    createSignal<OverlayKind | null>(null);
  const [ackInFlight, setAckInFlight] = createSignal(false);
  useOverlayMode({ isEnabled: true });
  createEffect(() => {
    if (snapshot().state === "normal") {
      setAcknowledgedKind(null);
      setAckInFlight(false);
    }
  });
  createEffect(() => {
    const state = snapshot().state;
    const expectedPendingState =
      props.kind === "work" ? "pending-work" : "pending-mini";
    if (
      state === expectedPendingState &&
      acknowledgedKind() !== props.kind &&
      !ackInFlight()
    ) {
      setAckInFlight(true);
      void dispatch({
        type: "ACK_BREAK_VISIBLE",
        breakType: props.kind,
      })
        .then(() => {
          setAcknowledgedKind(props.kind);
        })
        .catch(() => {
          setAcknowledgedKind(null);
        })
        .finally(() => {
          setAckInFlight(false);
        });
    }
  });

  const overlayProps =
    props.kind === "work"
      ? {
          onPostpone: () => {
            void dispatch({ type: "POSTPONE_WORK_BREAK" });
          },
        }
      : {};

  return (
    <BreakOverlay
      snapshot={snapshot()}
      config={config()}
      timings={timings()}
      {...overlayProps}
      onSkip={() => {
        void dispatch(
          props.kind === "work"
            ? { type: "END_WORK_BREAK" }
            : { type: "END_MINI_BREAK" },
        );
      }}
    />
  );
}

function WarningWindow() {
  const snapshot = useAtomValue(() => snapshotAtom);
  const config = useAtomValue(() => configAtom);
  const snapshotReceivedAt = useAtomValue(() => snapshotReceivedAtAtom);
  const connectionStatus = useAtomValue(() => connectionStatusAtom);
  const dispatch = useDispatch();
  const timings = useInterpolatedTimings(
    snapshot,
    snapshotReceivedAt,
    () => connectionStatus() === "open",
  );
  const [postponeInFlight, setPostponeInFlight] = createSignal(false);
  useOverlayMode({ isEnabled: true });
  const displaySeconds = () => {
    const warning = snapshot().breakWarning;
    if (!warning) {
      return 0;
    }
    if (warning.phase === "waiting-for-activity-pause") {
      return warning.forcedStartInSeconds ?? 0;
    }
    const currentConfig = config();
    const projected = timings();
    return warning.breakType === "work"
      ? Math.max(currentConfig.work.intervalSeconds - projected.workElapsed, 0)
      : Math.max(currentConfig.mini.intervalSeconds - projected.miniElapsed, 0);
  };
  const handlePostpone = (): void => {
    const warning = snapshot().breakWarning;
    if (!warning || postponeInFlight()) {
      return;
    }
    setPostponeInFlight(true);
    dispatch({ type: "POSTPONE_BREAK", breakType: warning.breakType })
      .catch((error) => {
        console.error("[AntiRSI] Failed to postpone break warning", error);
      })
      .finally(() => {
        setPostponeInFlight(false);
      });
  };

  return (
    <BreakWarningToast
      warning={snapshot().breakWarning}
      displaySeconds={displaySeconds()}
      onPostpone={handlePostpone}
      postponeDisabled={postponeInFlight()}
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
    <RegistryProvider>
      <AntiRsiGate>
        <AppShell />
      </AntiRsiGate>
    </RegistryProvider>
  );
}

export const Route = createRootRoute({ component: RootLayout });
