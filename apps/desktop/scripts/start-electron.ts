import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(__dirname, "..")
const require = createRequire(import.meta.url)
const electronBinaryPath = require("electron") as string
const childEnv = { ...process.env }

delete childEnv.ELECTRON_RUN_AS_NODE

const child = spawn(electronBinaryPath, ["dist-electron/main.js"], {
  stdio: "inherit",
  cwd: desktopDir,
  env: childEnv,
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
