import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], {
  encoding: "utf8",
}).trim();

if (!targetTriple) {
  throw new Error("Could not determine Rust host target triple");
}

const outputPath = join(
  import.meta.dirname,
  "..",
  "src-tauri",
  "binaries",
  `antirsi-sidecar-${targetTriple}`,
);

mkdirSync(dirname(outputPath), { recursive: true });

execFileSync(
  "bun",
  [
    "build",
    "../tauri-sidecar/src/main.ts",
    "--compile",
    "--outfile",
    outputPath,
  ],
  {
    cwd: join(import.meta.dirname, ".."),
    stdio: "inherit",
  },
);
