import type { Component } from "solid-js"
import { resolveWindowMeta } from "~/lib/antirsi-client"

export const Versions: Component = () => {
  const versions = resolveWindowMeta().versions

  return (
    <ul class="flex justify-center gap-4 text-xs text-text-tertiary">
      <li class="list-none">Electron v{versions.electron}</li>
      <li class="list-none">Chromium v{versions.chrome}</li>
      <li class="list-none">Node v{versions.node}</li>
    </ul>
  )
}
