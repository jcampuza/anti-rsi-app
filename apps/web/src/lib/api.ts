import { useAtomSet } from "@effect/atom-solid";
import { AntiRsiApi, type ApiAction } from "@antirsi/contracts/http-api";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { AtomHttpApi } from "effect/unstable/reactivity";
import { resolveApiAuthToken, resolveApiBaseUrl } from "~/lib/api-base-url";

/**
 * AtomHttpApi service generated from the shared {@link AntiRsiApi} contract.
 *
 * This replaces the hand-rolled `createAntiRsiHttpClient`: the typed client is
 * generated from the same contract the sidecar serves, and wrapped so endpoint
 * calls become reactive query/mutation atoms and a live SSE stream.
 *
 * The base URL is applied via `transformClient` (not the eager `baseUrl`
 * option) so `resolveApiBaseUrl()` is called lazily when the runtime layer is
 * built — otherwise it would throw at import time under vitest/jsdom, where no
 * desktop bridge exists. The trailing slash is stripped because the generated
 * client prepends the base with naive string concatenation and every endpoint
 * path (e.g. `/snapshot`) already carries a leading slash.
 */
export class Api extends AtomHttpApi.Service<Api>()("AntiRsiApi", {
  api: AntiRsiApi,
  httpClient: FetchHttpClient.layer,
  transformClient: (client) =>
    HttpClient.mapRequest(client, (request) => {
      const withBaseUrl = HttpClientRequest.prependUrl(
        resolveApiBaseUrl().replace(/\/+$/, ""),
      )(request);
      const token = resolveApiAuthToken();
      return token
        ? HttpClientRequest.setHeader("Authorization", `Bearer ${token}`)(
            withBaseUrl,
          )
        : withBaseUrl;
    }),
}) {}

/** Command mutation atom (POST /command). */
export const dispatchAtom = Api.mutation("root", "command");

/**
 * Returns `dispatch(action)`, which runs the command mutation and
 * resolves/rejects like the former `api.dispatch`. Must be called from a
 * component or computation under `RegistryProvider`.
 */
export const useDispatch = (): ((action: ApiAction) => Promise<void>) => {
  const run = useAtomSet(() => dispatchAtom, { mode: "promise" });
  // The mutation payload type is the schema-branded form of the same union;
  // the cast bridges that branding — the runtime shape is identical.
  return (action: ApiAction) =>
    run({ payload: action } as Parameters<typeof run>[0]);
};
