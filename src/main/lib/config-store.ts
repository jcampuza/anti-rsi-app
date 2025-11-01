import { promises as fs } from "fs"
import { dirname, join } from "path"
import type { AntiRsiConfig } from "../../common/antirsi-core"

export class ConfigStore {
  private readonly filePath: string

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "antirsi-config.json")
  }

  async load(): Promise<Partial<AntiRsiConfig> | undefined> {
    try {
      const contents = await fs.readFile(this.filePath, "utf-8")
      return JSON.parse(contents) as Partial<AntiRsiConfig>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined
      }
      console.error("[AntiRSI] Failed to load config:", error)
      return undefined
    }
  }

  async save(config: AntiRsiConfig): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true })

    try {
      await fs.writeFile(this.filePath, JSON.stringify(config, null, 2), "utf-8")
    } catch (error) {
      console.error("[AntiRSI] Failed to persist config:", error)
    }
  }
}
