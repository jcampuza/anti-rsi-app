import { resolve } from "node:path"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import tailwindcss from "@tailwindcss/vite"
import solid from "vite-plugin-solid"
import { defineConfig } from "vite"

const port = Number(process.env.PORT ?? 5733)

export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(process.env.VITE_API_BASE_URL ?? ""),
  },
  plugins: [
    tanstackRouter({ target: "solid", autoCodeSplitting: true }),
    solid(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "~": resolve(__dirname, "src"),
    },
  },
  server: {
    port,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },
})
