// @refresh reload
import { render } from "solid-js/web"
import { resolveApiBaseUrl } from "~/lib/api-base-url"
import { App } from "./app"

resolveApiBaseUrl()

const root = document.getElementById("root")
if (!(root instanceof HTMLElement)) {
  throw new Error("Root element not found")
}

render(() => <App />, root)
