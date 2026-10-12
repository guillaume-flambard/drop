/** The engine's version, as in packages/node/package.json (a test keeps them equal): shown in the workspace (T4.37). */
export const ENGINE_VERSION = '0.1.0';

/** The app's version, handed over by the desktop shell in DROP_APP_VERSION; undefined for a `drop serve` in a terminal. */
export function appVersion(env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const value = env.DROP_APP_VERSION;
  return value && /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:[-+][0-9A-Za-z.-]{1,40})?$/.test(value) ? value : undefined;
}
