import { spawn } from "node:child_process"

const rendererPort = Number(process.env.ELECTRON_RENDERER_PORT ?? 5733)
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? `http://localhost:${rendererPort}`

const MODES = {
  dev: [
    "run",
    "dev",
    "--ui=tui",
    "--filter=@antirsi/web",
    "--filter=@antirsi/desktop",
    "--parallel",
  ],
  "dev:web": ["run", "dev", "--filter=@antirsi/web"],
  "dev:desktop": ["run", "dev", "--filter=@antirsi/web", "--filter=@antirsi/desktop", "--parallel"],
} as const

type DevMode = keyof typeof MODES

const requestedMode = process.argv[2] ?? "dev"

if (!(requestedMode in MODES)) {
  console.error(`Unknown dev mode: ${requestedMode}`)
  console.error(`Expected one of: ${Object.keys(MODES).join(", ")}`)
  process.exit(1)
}

const mode = requestedMode as DevMode
const child = spawn("turbo", MODES[mode], {
  env: {
    ...process.env,
    ELECTRON_RENDERER_PORT: String(rendererPort),
    PORT: String(rendererPort),
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
