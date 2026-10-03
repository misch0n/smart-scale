import { describe, expect, it } from 'vitest';
import { detectCapabilities, type CapabilityEnv } from './capabilities';

const fn = () => undefined;

const fullEnv: CapabilityEnv = {
  isSecureContext: true,
  indexedDB: { open: fn },
  navigator: {
    bluetooth: { requestDevice: fn, getDevices: fn },
    storage: { persist: fn },
    wakeLock: { request: fn },
    share: fn,
    mediaDevices: { getUserMedia: fn },
  },
};

const availability = (env: CapabilityEnv) =>
  Object.fromEntries(detectCapabilities(env).map((c) => [c.id, c.available]));

describe('detectCapabilities', () => {
  it('reports every capability as available when the APIs exist', () => {
    expect(Object.values(availability(fullEnv)).every(Boolean)).toBe(true);
  });

  it('reports nothing available in an empty environment', () => {
    expect(Object.values(availability({})).some(Boolean)).toBe(false);
  });

  it('separates requestDevice from getDevices, since shims may implement only the first', () => {
    const result = availability({ navigator: { bluetooth: { requestDevice: fn } } });
    expect(result['web-bluetooth']).toBe(true);
    expect(result['bluetooth-get-devices']).toBe(false);
  });

  it('requires functions, not mere presence', () => {
    const result = availability({ navigator: { bluetooth: { requestDevice: {} } } });
    expect(result['web-bluetooth']).toBe(false);
  });

  it('uses unique ids', () => {
    const ids = detectCapabilities(fullEnv).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
