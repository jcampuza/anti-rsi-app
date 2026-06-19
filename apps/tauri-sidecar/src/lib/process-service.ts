import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startSpacedLoop } from "@antirsi/utils";
import { log } from "./logger";

const execFileAsync = promisify(execFile);
const WATCHED_PROCESSES = ["zoom.us"];
const PROCESS_POLL_INTERVAL_MS = 2500;

type ProcessPollingDeps = {
  onProcessesChanged: (processes: string[]) => void;
};

const isProcessRunning = async (name: string): Promise<boolean> => {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-x", name]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
};

const pollWatchedProcesses = async (): Promise<string[]> => {
  const running: string[] = [];
  for (const processName of WATCHED_PROCESSES) {
    if (await isProcessRunning(processName)) {
      running.push(processName);
    }
  }
  return running;
};

const sameList = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((item, index) => item === right[index]);

export const startWatchedProcessPolling = ({
  onProcessesChanged,
}: ProcessPollingDeps): (() => void) => {
  let lastProcesses: string[] = [];

  return startSpacedLoop(
    async () => {
      const processes = await pollWatchedProcesses();
      if (sameList(lastProcesses, processes)) {
        return;
      }
      lastProcesses = processes;
      onProcessesChanged(processes);
    },
    PROCESS_POLL_INTERVAL_MS,
    {
      continueOnError: true,
      onError: (error) => {
        log(
          "Process polling failed",
          error instanceof Error ? error.message : error,
        );
      },
    },
  );
};
