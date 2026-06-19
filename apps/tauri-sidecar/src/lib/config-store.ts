import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAntiRsiConfig, type AntiRsiConfig } from "@antirsi/core";
import { log } from "./logger";

const CONFIG_FILENAME = "antirsi-config.json";

const getConfigPath = (userDataDir: string): string =>
  join(userDataDir, CONFIG_FILENAME);

export const loadConfig = async (
  userDataDir: string,
): Promise<AntiRsiConfig | null> => {
  try {
    const raw = await readFile(getConfigPath(userDataDir), "utf8");
    return parseAntiRsiConfig(JSON.parse(raw));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        return null;
      }
    }
    log("Config load failed", error instanceof Error ? error.message : error);
    return null;
  }
};

export const saveConfig = async (
  userDataDir: string,
  config: AntiRsiConfig,
): Promise<void> => {
  await mkdir(userDataDir, { recursive: true });
  const configPath = getConfigPath(userDataDir);
  const tempPath = `${configPath}.tmp`;

  try {
    await writeFile(
      tempPath,
      JSON.stringify(parseAntiRsiConfig(config), null, 2),
      "utf8",
    );
    await rename(tempPath, configPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    log("Config save failed", error instanceof Error ? error.message : error);
  }
};
