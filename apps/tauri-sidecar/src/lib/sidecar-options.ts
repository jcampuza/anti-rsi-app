import { homedir } from "node:os";
import { join } from "node:path";
import { Config, Context, Effect, Layer } from "effect";

const DEFAULT_PORT = 0;
const DEFAULT_USER_DATA_DIR = join(
  homedir(),
  "Library",
  "Application Support",
  "Anti RSI",
);

export type SidecarOptions = {
  readonly port: number;
  readonly userDataDir: string;
  readonly parentPid: number | null;
};

type CliOptions = {
  port?: number;
  userDataDir?: string;
  parentPid?: number | null;
};

export class SidecarOptionsService extends Context.Service<
  SidecarOptionsService,
  SidecarOptions
>()("@antirsi/tauri-sidecar/SidecarOptions") {}

const EnvOptionsConfig = Config.all({
  port: Config.port("ANTIRSI_API_PORT").pipe(Config.withDefault(DEFAULT_PORT)),
  userDataDir: Config.string("ANTIRSI_USER_DATA_DIR").pipe(
    Config.withDefault(DEFAULT_USER_DATA_DIR),
  ),
});

const parseCliOptions = (args: readonly string[]): CliOptions => {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextArg = args[index + 1];
    if (arg === "--port" && nextArg) {
      const port = Number(nextArg);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid API port: ${nextArg}`);
      }
      options.port = port;
      index += 1;
      continue;
    }
    if (arg === "--user-data-dir" && nextArg) {
      options.userDataDir = nextArg;
      index += 1;
      continue;
    }
    if (arg === "--parent-pid" && nextArg) {
      const parentPid = Number(nextArg);
      if (!Number.isInteger(parentPid) || parentPid <= 0) {
        throw new Error(`Invalid parent PID: ${nextArg}`);
      }
      options.parentPid = parentPid;
      index += 1;
    }
  }

  return options;
};

export const loadSidecarOptions = Effect.gen(function* () {
  const envOptions = yield* EnvOptionsConfig;
  const cliOptions = yield* Effect.sync(() =>
    parseCliOptions(process.argv.slice(2)),
  );
  return { ...envOptions, parentPid: null, ...cliOptions };
});

export const SidecarOptionsLayer = Layer.effect(
  SidecarOptionsService,
  loadSidecarOptions.pipe(Effect.map(SidecarOptionsService.of)),
);
