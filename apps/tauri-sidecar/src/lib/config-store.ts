import { join } from "node:path";
import { parseAntiRsiConfig, type AntiRsiConfig } from "@antirsi/core";
import { Context, Effect, FileSystem, Layer } from "effect";

const CONFIG_FILENAME = "antirsi-config.json";

const getConfigPath = (userDataDir: string): string =>
  join(userDataDir, CONFIG_FILENAME);

type ConfigStoreService = {
  readonly load: (userDataDir: string) => Effect.Effect<AntiRsiConfig | null>;
  readonly save: (
    userDataDir: string,
    config: AntiRsiConfig,
  ) => Effect.Effect<void>;
};

export class ConfigStore extends Context.Service<
  ConfigStore,
  ConfigStoreService
>()("@antirsi/tauri-sidecar/ConfigStore") {}

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "reason" in error &&
  typeof error.reason === "object" &&
  error.reason !== null &&
  "_tag" in error.reason &&
  error.reason._tag === "NotFound";

const logConfigFailure = (
  message: string,
  error: unknown,
): Effect.Effect<void> => Effect.logError(message, { error });

export const ConfigStoreLayer = Layer.effect(
  ConfigStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const load = Effect.fn("ConfigStore.load")(function* (userDataDir: string) {
      const configPath = getConfigPath(userDataDir);
      const raw = yield* fs.readFileString(configPath).pipe(
        Effect.catchIf(isNotFound, () => Effect.succeed(null)),
        Effect.catch((error) =>
          logConfigFailure("Config load failed", error).pipe(Effect.as(null)),
        ),
      );
      if (raw === null) {
        return null;
      }

      return yield* Effect.try({
        try: () => parseAntiRsiConfig(JSON.parse(raw) as unknown),
        catch: (error) => error,
      }).pipe(
        Effect.catch((error) =>
          logConfigFailure("Config parse failed", error).pipe(Effect.as(null)),
        ),
      );
    });

    const save = Effect.fn("ConfigStore.save")(function* (
      userDataDir: string,
      config: AntiRsiConfig,
    ) {
      const configPath = getConfigPath(userDataDir);
      const tempPath = `${configPath}.tmp`;

      const writeConfig = Effect.gen(function* () {
        yield* fs.makeDirectory(userDataDir, { recursive: true });
        const serialized = yield* Effect.try({
          try: () => JSON.stringify(parseAntiRsiConfig(config), null, 2),
          catch: (error) => error,
        });
        yield* fs.writeFileString(tempPath, serialized);
        yield* fs.rename(tempPath, configPath);
      });

      yield* writeConfig.pipe(
        Effect.catch((error) =>
          fs
            .remove(tempPath)
            .pipe(
              Effect.ignore,
              Effect.andThen(logConfigFailure("Config save failed", error)),
            ),
        ),
      );
    });

    return ConfigStore.of({ load, save });
  }),
);
