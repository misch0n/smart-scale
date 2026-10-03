/**
 * Asking the browser to keep this site's data. Safari can evict IndexedDB for sites that
 * aren't installed when storage runs low (spec "Storage and export"), and beacio only works in
 * a Safari tab (D-016), so the answer matters. The probe shows it (T1.8, hardware test B6).
 */

export interface PersistenceStatus {
  /** Whether the browser has `navigator.storage.persist()`. */
  readonly supported: boolean;
  /**
   * true: the browser won't evict this site's data to free space. false: it may. null: not
   * known, because the API is missing or failed.
   */
  readonly persisted: boolean | null;
  /** What this site stores, in bytes (`navigator.storage.estimate()`); null if not known. */
  readonly usageBytes: number | null;
  /** How much the browser lets this site store, in bytes; null if not known. */
  readonly quotaBytes: number | null;
  /** Why a call failed, like `persist(): UnknownError: …`; null if none did. */
  readonly error: string | null;
}

/** The parts of `navigator.storage` this uses. Loose, so tests can pass fakes. */
export interface StorageManagerLike {
  readonly persist?: () => Promise<boolean>;
  readonly persisted?: () => Promise<boolean>;
  readonly estimate?: () => Promise<{ readonly usage?: number; readonly quota?: number }>;
}

/**
 * Requests persistent storage (`persist()`, or `persisted()` where only that exists) and
 * reads the usage estimate. It never throws: failures are reported in the status. Calling it
 * again is harmless; the browser remembers its answer.
 */
export async function requestPersistence(
  manager: StorageManagerLike | undefined = globalThis.navigator?.storage,
): Promise<PersistenceStatus> {
  const errors: string[] = [];
  const attempt = async <T>(name: string, call: () => Promise<T>): Promise<T | null> => {
    try {
      return await call();
    } catch (error) {
      errors.push(`${name}(): ${describe(error)}`);
      return null;
    }
  };

  const persist = manager?.persist?.bind(manager);
  const persisted = manager?.persisted?.bind(manager);
  const estimate = manager?.estimate?.bind(manager);
  let granted: boolean | null = null;
  if (persist) granted = await attempt('persist', persist);
  if (granted === null && persisted) granted = await attempt('persisted', persisted);
  const usage = estimate ? await attempt('estimate', estimate) : null;

  return {
    supported: persist !== undefined,
    persisted: typeof granted === 'boolean' ? granted : null,
    usageBytes: finiteOrNull(usage?.usage),
    quotaBytes: finiteOrNull(usage?.quota),
    error: errors.length > 0 ? errors.join('; ') : null,
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
