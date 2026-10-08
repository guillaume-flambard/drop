import sodium from 'libsodium-wrappers';

let ready: Promise<typeof sodium> | undefined;

/** libsodium loads asynchronously once; every crypto entry point awaits this. */
export function getSodium(): Promise<typeof sodium> {
  ready ??= sodium.ready.then(() => sodium);
  return ready;
}
