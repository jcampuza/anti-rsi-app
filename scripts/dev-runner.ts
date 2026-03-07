import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const rendererPort = Number(process.env.ELECTRON_RENDERER_PORT ?? 5733)
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? `http://localhost:${rendererPort}`
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const web = spawn("bun", ["run", "dev"], {
  cwd: resolve(rootDir, "apps/web"),
  env: { ...process.env, PORT: String(rendererPort) },
  stdio: "inherit",
})

const desktop = spawn("bun", ["run", "dev"], {
  cwd: resolve(rootDir, "apps/desktop"),
  env: {
    ...process.env,
    ELECTRON_RENDERER_PORT: String(rendererPort),
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  stdio: "inherit",
})

let shuttingDown = false

const shutdown = (code: number): void => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  web.kill("SIGTERM")
  desktop.kill("SIGTERM")
  process.exit(code)
}

for (const child of [web, desktop]) {
  child.on("exit", (code) => {
    shutdown(code ?? 0)
  })
}

process.once("SIGINT", () => shutdown(130))
process.once("SIGTERM", () => shutdown(143))
