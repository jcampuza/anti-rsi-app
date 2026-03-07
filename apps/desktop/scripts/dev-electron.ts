import { spawn, spawnSync } from "node:child_process"
import { watch } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import waitOn from "wait-on"

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(__dirname, "..")
const port = Number(process.env.ELECTRON_RENDERER_PORT ?? 5733)
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? `http://localhost:${port}`
const requiredFiles = [
  join(desktopDir, "dist-electron/main.js"),
  join(desktopDir, "dist-electron/preload.js"),
]
const watchedDirectories = [{ directory: "dist-electron", files: new Set(["main.js", "preload.js"]) }]
const forcedShutdownTimeoutMs = 1500
const restartDebounceMs = 120

const require = createRequire(import.meta.url)
const electronBinaryPath = require("electron") as string
const childEnv: NodeJS.ProcessEnv = { ...process.env, VITE_DEV_SERVER_URL: devServerUrl }
delete childEnv.ELECTRON_RUN_AS_NODE

await waitOn({
  resources: [`tcp:${port}`, ...requiredFiles.map((filePath) => `file:${filePath}`)],
})

let shuttingDown = false
let restartTimer: ReturnType<typeof setTimeout> | null = null
let currentApp: ReturnType<typeof spawn> | null = null
let restartQueue = Promise.resolve()
const expectedExits = new WeakSet<ReturnType<typeof spawn>>()
const watchers: Array<ReturnType<typeof watch>> = []

const startApp = (): void => {
  if (shuttingDown || currentApp !== null) {
    return
  }

  const app = spawn(electronBinaryPath, ["dist-electron/main.js"], {
    cwd: desktopDir,
    env: childEnv,
    stdio: "inherit",
  })

  currentApp = app

  app.once("error", () => {
    if (currentApp === app) {
      currentApp = null
    }
    if (!shuttingDown) {
      scheduleRestart()
    }
  })

  app.once("exit", () => {
    if (currentApp === app) {
      currentApp = null
    }
    if (!shuttingDown && !expectedExits.has(app)) {
      scheduleRestart()
    }
  })
}

const stopApp = async (): Promise<void> => {
  const app = currentApp
  if (!app) {
    return
  }

  currentApp = null
  expectedExits.add(app)

  await new Promise<void>((resolvePromise) => {
    let settled = false

    const finish = (): void => {
      if (settled) {
        return
      }
      settled = true
      resolvePromise()
    }

    app.once("exit", finish)
    app.kill("SIGTERM")

    setTimeout(() => {
      if (settled) {
        return
      }
      app.kill("SIGKILL")
      finish()
    }, forcedShutdownTimeoutMs).unref()
  })
}

const scheduleRestart = (): void => {
  if (shuttingDown) {
    return
  }

  if (restartTimer) {
    clearTimeout(restartTimer)
  }

  restartTimer = setTimeout(() => {
    restartTimer = null
    restartQueue = restartQueue
      .catch(() => undefined)
      .then(async () => {
        await stopApp()
        if (!shuttingDown) {
          startApp()
        }
      })
  }, restartDebounceMs)
}

const startWatchers = (): void => {
  for (const { directory, files } of watchedDirectories) {
    const watcher = watch(join(desktopDir, directory), { persistent: true }, (_eventType, filename) => {
      if (typeof filename !== "string" || !files.has(filename)) {
        return
      }
      scheduleRestart()
    })
    watchers.push(watcher)
  }
}

const shutdown = async (exitCode: number): Promise<void> => {
  if (shuttingDown) return
  shuttingDown = true

  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }

  for (const watcher of watchers) {
    watcher.close()
  }

  await stopApp()
  process.exit(exitCode)
}

if (process.platform !== "win32") {
  spawnSync("pkill", ["-f", "--", `dist-electron/main.js`], { stdio: "ignore" })
}

startWatchers()
startApp()

process.once("SIGINT", () => {
  void shutdown(130)
})
process.once("SIGTERM", () => {
  void shutdown(143)
})
