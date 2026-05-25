// @refresh reload
import { RouterProvider, createRouter } from "@tanstack/solid-router";
import { render } from "solid-js/web";
import { resolveApiBaseUrl } from "~/lib/api-base-url";
import { routeTree } from "./routeTree.gen";

resolveApiBaseUrl();

const router = createRouter({ routeTree });

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root") as HTMLElement;

render(() => <RouterProvider router={router} />, root);
