/**
 * GATT identifiers for the BOOKOO scale (spec "BLE protocol reference"). The scale uses 16-bit
 * shorthand UUIDs on the Bluetooth base UUID. Web Bluetooth accepts either form; the 128-bit
 * strings are lower case, as `BluetoothUUID.canonicalUUID()` returns them.
 */

/** Expands a 16-bit shorthand UUID onto the base UUID `0000xxxx-0000-1000-8000-00805f9b34fb`. */
export function uuid16To128(uuid16: number): string {
  if (!Number.isInteger(uuid16) || uuid16 < 0 || uuid16 > 0xffff) {
    throw new RangeError(`uuid16To128: ${uuid16} is not a 16-bit UUID`);
  }
  return `0000${uuid16.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
}

export const SERVICE_UUID16 = 0x0ffe;
export const SERVICE_UUID = uuid16To128(SERVICE_UUID16);

/** Weight data. Notify. */
export const WEIGHT_CHARACTERISTIC_UUID16 = 0xff11;
export const WEIGHT_CHARACTERISTIC_UUID = uuid16To128(WEIGHT_CHARACTERISTIC_UUID16);

/**
 * Commands. Write. Whether it also notifies is unknown (hardware test A15); `03 0D` event
 * frames may arrive here (protocol-notes, finding 8).
 */
export const COMMAND_CHARACTERISTIC_UUID16 = 0xff12;
export const COMMAND_CHARACTERISTIC_UUID = uuid16To128(COMMAND_CHARACTERISTIC_UUID16);

/**
 * Advertised-name prefix. The scale may not advertise its service, so discovery also matches
 * the name (protocol-notes, finding 12; hardware test A14).
 */
export const DEVICE_NAME_PREFIX = 'BOOKOO';
