import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const LOG_FILENAME = "anti-rsi.log";

let configuredLogFilePath: string | undefined;

export const getLogFilePath = (userDataDir: string): string =>
  join(userDataDir, LOG_FILENAME);

export const configureLogger = (userDataDir: string): string => {
  mkdirSync(userDataDir, { recursive: true });
  configuredLogFilePath = getLogFilePath(userDataDir);
  logInfo("Sidecar logger initialized", { logFilePath: configuredLogFilePath });
  return configuredLogFilePath;
};

export const log = (message: string, detail?: unknown): void => {
  writeLog("Error", message, detail);
};

export const logInfo = (message: string, detail?: unknown): void => {
  writeLog("Info", message, detail);
};

const writeLog = (
  level: "Error" | "Info",
  message: string,
  detail?: unknown,
): void => {
  const suffix = detail === undefined ? "" : ` ${formatDetail(detail)}`;
  console.error(`[antirsi-sidecar] ${message}${suffix}`);

  if (!configuredLogFilePath) {
    return;
  }

  try {
    appendFileSync(
      configuredLogFilePath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: "antirsi-sidecar",
        message,
        detail: normalizeDetail(detail),
      })}\n`,
      "utf8",
    );
  } catch (error) {
    console.error(
      "[antirsi-sidecar] Failed to write log file",
      error instanceof Error ? error.message : error,
    );
  }
};

const formatDetail = (detail: unknown): string => {
  if (typeof detail === "string") {
    return detail;
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
};

const normalizeDetail = (detail: unknown): unknown => {
  if (detail instanceof Error) {
    return { name: detail.name, message: detail.message, stack: detail.stack };
  }
  if (detail === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(detail)) as unknown;
  } catch {
    return String(detail);
  }
};
