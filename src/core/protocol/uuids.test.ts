import { describe, expect, it } from 'vitest';
import {
  COMMAND_CHARACTERISTIC_UUID,
  COMMAND_CHARACTERISTIC_UUID16,
  SERVICE_UUID,
  SERVICE_UUID16,
  WEIGHT_CHARACTERISTIC_UUID,
  WEIGHT_CHARACTERISTIC_UUID16,
  uuid16To128,
} from './uuids';

describe('GATT identifiers', () => {
  it('match the spec, in 16-bit and 128-bit form', () => {
    expect(SERVICE_UUID16).toBe(0x0ffe);
    expect(WEIGHT_CHARACTERISTIC_UUID16).toBe(0xff11);
    expect(COMMAND_CHARACTERISTIC_UUID16).toBe(0xff12);
    expect(SERVICE_UUID).toBe('00000ffe-0000-1000-8000-00805f9b34fb');
    expect(WEIGHT_CHARACTERISTIC_UUID).toBe('0000ff11-0000-1000-8000-00805f9b34fb');
    expect(COMMAND_CHARACTERISTIC_UUID).toBe('0000ff12-0000-1000-8000-00805f9b34fb');
  });
});

describe('uuid16To128', () => {
  it('pads short values', () => {
    expect(uuid16To128(0x0001)).toBe('00000001-0000-1000-8000-00805f9b34fb');
  });

  it('rejects values that are not 16-bit', () => {
    expect(() => uuid16To128(0x10000)).toThrow(RangeError);
    expect(() => uuid16To128(-1)).toThrow(RangeError);
    expect(() => uuid16To128(1.5)).toThrow(RangeError);
  });
});
