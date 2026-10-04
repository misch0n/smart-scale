/**
 * Detects the browser APIs the app relies on now or may use later. The probe screen shows the
 * result so that runtime support, on iOS in particular (beacio or Bluefy, D-016), can be read
 * off one screenshot (docs/hardware-tests.md, B1).
 *
 * This is feature detection only. Real Bluetooth access belongs in src/transport.
 */

export interface Capability {
  id: string;
  label: string;
  available: boolean;
  /** What the app needs it for. */
  usedFor: string;
}

/** The subset of the global object that detection reads. Kept loose so tests can pass fakes. */
export interface CapabilityEnv {
  isSecureContext?: boolean;
  indexedDB?: { open?: unknown };
  navigator?: {
    bluetooth?: { requestDevice?: unknown; getDevices?: unknown };
    storage?: { persist?: unknown };
    wakeLock?: { request?: unknown };
    share?: unknown;
    mediaDevices?: { getUserMedia?: unknown };
    locks?: { request?: unknown };
  };
}

const isFunction = (value: unknown): boolean => typeof value === 'function';

export function detectCapabilities(env: CapabilityEnv): Capability[] {
  const nav = env.navigator;
  return [
    {
      id: 'secure-context',
      label: 'Secure context (HTTPS)',
      available: env.isSecureContext === true,
      usedFor: 'Required by Web Bluetooth and the microphone',
    },
    {
      id: 'web-bluetooth',
      label: 'Web Bluetooth',
      available: isFunction(nav?.bluetooth?.requestDevice),
      usedFor: 'Connecting to the scale',
    },
    {
      id: 'bluetooth-get-devices',
      label: 'Bluetooth getDevices()',
      available: isFunction(nav?.bluetooth?.getDevices),
      usedFor: 'Reconnecting without the device chooser (spec: "Re-pairing")',
    },
    {
      id: 'indexeddb',
      label: 'IndexedDB',
      available: isFunction(env.indexedDB?.open),
      usedFor: 'Storing recordings on the device',
    },
    {
      id: 'storage-persist',
      label: 'Persistent storage request',
      available: isFunction(nav?.storage?.persist),
      usedFor: 'Asking the browser not to evict recordings',
    },
    {
      id: 'wake-lock',
      label: 'Screen Wake Lock',
      available: isFunction(nav?.wakeLock?.request),
      usedFor: 'Keeping the screen on while recording',
    },
    {
      id: 'web-share',
      label: 'Web Share',
      available: isFunction(nav?.share),
      usedFor: 'Exporting recordings via the share sheet',
    },
    {
      id: 'microphone',
      label: 'Microphone (getUserMedia)',
      available: isFunction(nav?.mediaDevices?.getUserMedia),
      usedFor: 'Audio pump detection (Phase 3)',
    },
    {
      id: 'web-locks',
      label: 'Web Locks',
      available: isFunction(nav?.locks?.request),
      usedFor:
        "Ending recordings left open by a closed tab, without touching another tab's (D-024)",
    },
  ];
}
