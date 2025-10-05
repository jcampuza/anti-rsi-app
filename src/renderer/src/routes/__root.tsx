import { useAntiRsiStore } from '@renderer/stores/antirsi'
import { useProcessesStore } from '@renderer/stores/processes'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

useAntiRsiStore.getState().init()
useProcessesStore.getState().init()

const RootLayout = () => (
  <>
    <Outlet />
    <TanStackRouterDevtools />
  </>
)

export const Route = createRootRoute({ component: RootLayout })
