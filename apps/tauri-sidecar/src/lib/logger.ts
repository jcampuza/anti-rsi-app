import { join } from "node:path";

const LOG_FILENAME = "anti-rsi.log";

export const getLogFilePath = (userDataDir: string): string =>
  join(userDataDir, LOG_FILENAME);
