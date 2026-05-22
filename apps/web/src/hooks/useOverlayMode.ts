import { createEffect, onCleanup } from "solid-js"

export interface UseOverlayModeOptions {
  isEnabled?: boolean
}

export const useOverlayMode = (options?: UseOverlayModeOptions | (() => UseOverlayModeOptions)): void => {
  createEffect(() => {
    const resolved = typeof options === "function" ? options() : options
    const isEnabled = resolved?.isEnabled ?? false
    const body = document.body
    if (!body) return

    if (isEnabled) {
      body.classList.add("overlay-mode")
    } else {
      body.classList.remove("overlay-mode")
    }

    onCleanup(() => {
      body.classList.remove("overlay-mode")
    })
  })
}
