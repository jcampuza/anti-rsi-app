import * as KeyValueStore from '@effect/platform/KeyValueStore';
import { Effect } from 'effect';
import { AntiRsiConfigSchema } from '../../common/config-schema';

const CONFIG_KEY = 'antirsi-config';

export class ConfigStore extends Effect.Service<ConfigStore>()('ConfigStore', {
  effect: Effect.gen(function* () {
    const kv = yield* KeyValueStore.KeyValueStore;
    const schemaStore = kv.forSchema(AntiRsiConfigSchema);

    return {
      load: schemaStore
        .get(CONFIG_KEY)
        .pipe(Effect.tap(() => Effect.log('Loading config from store'))),

      save: (config) => {
        return schemaStore.set(CONFIG_KEY, config).pipe(
          Effect.tap(() => Effect.log('Saving config to store')),
          Effect.withSpan('save-config'),
          Effect.catchTag('ParseError', (error) => Effect.logError('Config parse error', error)),
          Effect.catchTag('SystemError', (error) => Effect.logError('Config save error', error)),
        );
      },
    } as const;
  }),
}) {}
