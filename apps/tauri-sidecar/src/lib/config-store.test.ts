import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, type AntiRsiConfig } from "@antirsi/core";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Logger } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigStore, ConfigStoreLayer } from "./config-store";

type ConfigStoreService = {
  readonly load: (userDataDir: string) => Effect.Effect<AntiRsiConfig | null>;
  readonly save: (
    userDataDir: string,
    config: AntiRsiConfig,
  ) => Effect.Effect<void>;
};

const CONFIG_FILENAME = "antirsi-config.json";

// Silence expected "Config load failed" / "Config parse failed" error logs.
const SilentLoggerLayer = Logger.layer([], { mergeWithExisting: false });

const TestConfigStoreLayer = ConfigStoreLayer.pipe(
  Layer.provide(NodeFileSystem.layer),
  Layer.provideMerge(SilentLoggerLayer),
);

const runStore = <A>(
  body: (store: ConfigStoreService) => Effect.Effect<A>,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* ConfigStore;
      return yield* body(store);
    }).pipe(Effect.provide(TestConfigStoreLayer)),
  );

describe("ConfigStore", () => {
  const tempDirs: string[] = [];

  const makeTempDir = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), "antirsi-config-"));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("returns null for a missing config file without failing", async () => {
    const dir = await makeTempDir();
    const loaded = await runStore((store) => store.load(dir));
    expect(loaded).toBeNull();
  });

  it("returns null for corrupt JSON without failing", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, CONFIG_FILENAME), "{ not valid json !!!", "utf8");
    const loaded = await runStore((store) => store.load(dir));
    expect(loaded).toBeNull();
  });

  it("returns null for valid JSON that fails config validation", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, CONFIG_FILENAME),
      JSON.stringify({ mini: { intervalSeconds: -1 } }),
      "utf8",
    );
    const loaded = await runStore((store) => store.load(dir));
    expect(loaded).toBeNull();
  });

  it("round-trips a saved config", async () => {
    const dir = await makeTempDir();
    const config: AntiRsiConfig = {
      ...defaultConfig(),
      tickIntervalMs: 250,
    };

    const loaded = await runStore((store) =>
      store.save(dir, config).pipe(Effect.andThen(store.load(dir))),
    );

    expect(loaded).toEqual(config);
  });

  it("saves atomically: valid JSON on disk and no temp file left behind", async () => {
    const dir = await makeTempDir();
    const config = defaultConfig();

    await runStore((store) => store.save(dir, config));
    // Overwrite an existing file too (rename over existing target).
    await runStore((store) =>
      store.save(dir, { ...config, tickIntervalMs: 750 }),
    );

    const files = await readdir(dir);
    expect(files).toEqual([CONFIG_FILENAME]);
    const raw = await readFile(join(dir, CONFIG_FILENAME), "utf8");
    const parsed = JSON.parse(raw) as AntiRsiConfig;
    expect(parsed.tickIntervalMs).toBe(750);
  });

  it("creates the user data directory when saving into a missing path", async () => {
    const dir = await makeTempDir();
    const nested = join(dir, "does", "not", "exist");

    const loaded = await runStore((store) =>
      store
        .save(nested, defaultConfig())
        .pipe(Effect.andThen(store.load(nested))),
    );

    expect(loaded).toEqual(defaultConfig());
  });
});
