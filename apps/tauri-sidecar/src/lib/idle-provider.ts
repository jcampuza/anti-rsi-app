import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startSpacedLoop } from "@antirsi/utils";
import type { IdleTimeProvider } from "./antirsi-engine";

const execFileAsync = promisify(execFile);

const getMacIdleTimeSeconds = async (): Promise<number> => {
  try {
    const { stdout } = await execFileAsync("ioreg", ["-c", "IOHIDSystem"]);
    const match = /"HIDIdleTime"\s*=\s*(\d+)/.exec(stdout);
    if (!match) {
      return 0;
    }
    return Math.floor(Number(match[1]) / 1_000_000_000);
  } catch {
    return 0;
  }
};

export const createCachedIdleProvider = (): IdleTimeProvider => {
  let idleSeconds = 0;

  startSpacedLoop(async () => {
    idleSeconds = await getMacIdleTimeSeconds();
  }, 1000);

  return () => idleSeconds;
};
