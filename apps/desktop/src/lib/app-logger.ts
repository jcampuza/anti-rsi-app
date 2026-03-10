import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

const logFileNames = {
  main: 'main.log',
  renderer: 'renderer.log',
} as const;

type LogTarget = keyof typeof logFileNames;

const serializeDetail = (detail: unknown): string => {
  if (detail instanceof Error) {
    return detail.stack ?? `${detail.name}: ${detail.message}`;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
};

const getLogsDirectory = (): string => {
  app.setAppLogsPath();
  const logPath = app.getPath('logs');
  mkdirSync(logPath, { recursive: true });
  return logPath;
};

export const getAppLogPath = (target: LogTarget): string => {
  return join(getLogsDirectory(), logFileNames[target]);
};

export const writeAppLog = (target: LogTarget, message: string, detail?: unknown): void => {
  const line = `[${new Date().toISOString()}] ${message}${detail === undefined ? '' : ` ${serializeDetail(detail)}`}\n`;
  appendFileSync(getAppLogPath(target), line, 'utf8');
};
