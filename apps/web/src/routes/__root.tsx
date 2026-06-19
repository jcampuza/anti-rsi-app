import { Outlet, createRootRoute } from "@tanstack/solid-router";
import { BreakOverlay } from "~/components/BreakOverlay";
import { Header } from "~/components/Header";
import {
  AntiRsiBootstrap,
  AntiRsiProvider,
  useAntiRsi,
} from "~/context/antirsi";
import { useOverlayMode } from "~/hooks/useOverlayMode";
import "~/assets/tailwind.css";

type OverlayKind = "mini" | "work";

const getOverlayKind = (): OverlayKind | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const overlay = new URLSearchParams(window.location.search).get("overlay");
  return overlay === "mini" || overlay === "work" ? overlay : null;
};

function OverlayWindow(props: { kind: OverlayKind }) {
  const antirsi = useAntiRsi();
  useOverlayMode({ isEnabled: true });
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

function AppShell() {
  const overlayKind = getOverlayKind();

  if (overlayKind) {
    return <OverlayWindow kind={overlayKind} />;
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
