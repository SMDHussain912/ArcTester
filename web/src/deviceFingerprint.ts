type FingerprintStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => boolean; };
type CryptoUuidProvider = { randomUUID?: () => string };
/** Reuses a browser installation identifier or creates and stores one. */
export function getBrowserDeviceFingerprint(storage: FingerprintStorage, cryptoProvider: CryptoUuidProvider | null = typeof crypto !== "undefined" ? crypto : null, now: () => number = Date.now, random: () => number = Math.random): string {
  const key = "arctester-device-fingerprint";
  const existing = storage.getItem(key);
  if (existing) return existing;
  const fingerprint = typeof cryptoProvider?.randomUUID === "function" ? cryptoProvider.randomUUID() : `web-${now().toString(36)}-${random().toString(36).slice(2)}`;
  storage.setItem(key, fingerprint);
  return fingerprint;
}
