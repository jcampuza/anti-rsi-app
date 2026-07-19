import { homedir } from "node:os";
import { join } from "node:path";
import { Config, Context, Deferred, Effect, Layer, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import type { Environment } from "effect/unstable/cli/Command";

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
  readonly apiToken: string | null;
};

export class SidecarOptionsService extends Context.Service<
  SidecarOptionsService,
  SidecarOptions
>()("@antirsi/tauri-sidecar/SidecarOptions") {}

const portFlag = Flag.integer("port").pipe(
  Flag.filter(
    (port) => port >= 0 && port <= 65535,
    (port) => `Invalid API port: ${port}`,
  ),
  Flag.withFallbackConfig(Config.port("ANTIRSI_API_PORT")),
  Flag.withDefault(DEFAULT_PORT),
);

const userDataDirFlag = Flag.string("user-data-dir").pipe(
  Flag.withFallbackConfig(Config.string("ANTIRSI_USER_DATA_DIR")),
  Flag.withDefault(DEFAULT_USER_DATA_DIR),
);

const parentPidFlag = Flag.integer("parent-pid").pipe(
  Flag.filter(
    (parentPid) => parentPid > 0,
    (parentPid) => `Invalid parent PID: ${parentPid}`,
  ),
  Flag.optional,
);

// Auth token is env-only (never a CLI flag) since it's a secret: the Rust
// shell passes it via the child process environment when spawning the
// sidecar, keeping it out of process argv/listing. When unset, dev mode is
// assumed and no auth is enforced.
const apiTokenConfig = Config.string("ANTIRSI_API_TOKEN").pipe(
  Config.option,
);

export const loadSidecarOptions: Effect.Effect<
  SidecarOptions,
  unknown,
  Environment
> = Effect.gen(function* () {
  const parsed = yield* Deferred.make<SidecarOptions>();
  const apiToken = yield* apiTokenConfig;
  const command = Command.make(
    "antirsi-sidecar",
    {
      port: portFlag,
      userDataDir: userDataDirFlag,
      parentPid: parentPidFlag,
    },
    (options) =>
      Deferred.succeed(parsed, {
        port: options.port,
        userDataDir: options.userDataDir,
        parentPid: Option.getOrNull(options.parentPid),
        apiToken: Option.getOrNull(apiToken),
      }),
  );

  yield* Command.runWith(command, { version: "0.0.0" })(process.argv.slice(2));

  if (!Deferred.isDoneUnsafe(parsed)) {
    // Reached when the CLI intercepts the invocation (e.g. --help/--version)
    // instead of running the command handler.
    return yield* Effect.sync(() => process.exit(0));
  }

  return yield* Deferred.await(parsed);
});

export const SidecarOptionsLayer = Layer.effect(
  SidecarOptionsService,
  loadSidecarOptions.pipe(Effect.map(SidecarOptionsService.of)),
);
