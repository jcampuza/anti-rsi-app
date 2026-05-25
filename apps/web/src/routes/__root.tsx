import { Outlet, createRootRoute } from "@tanstack/solid-router";
import { Header } from "~/components/Header";
import { AntiRsiBootstrap, AntiRsiProvider } from "~/context/antirsi";
import "~/assets/tailwind.css";

function RootLayout() {
  return (
    <AntiRsiProvider>
      <AntiRsiBootstrap>
        <div>
          <Header />
          <Outlet />
        </div>
      </AntiRsiBootstrap>
    </AntiRsiProvider>
  );
}

export const Route = createRootRoute({ component: RootLayout });
