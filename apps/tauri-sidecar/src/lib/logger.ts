export const log = (message: string, detail?: unknown): void => {
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
  console.error(`[antirsi-sidecar] ${message}${suffix}`);
};
