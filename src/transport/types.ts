/**
 * The seam between BLE and the app (spec "Scope and platform"): everything above this file
 * talks to the scale only through `ScaleTransport`. It is deliberately narrow (connect,
 * disconnect, send a whitelisted command, receive notifications), so the source can change
 * without touching anything above it: Web Bluetooth in beacio or Bluefy (T1.4), the mock (T1.3),
 * a Capacitor plugin (T3.4) or, one day, a GaggiMate stream (spec "Out of scope").
 *
 * The contract, which every implementation keeps (D-020):
 * - Status goes `disconnected` → `connecting` → `connected` → `disconnected`. A transport
 *   reports `connected` before its first notification and `disconnected` after its last.
 * - Notifications arrive in order, with non-decreasing `tArrival` from the transport's clock
 *   (`now()`). The recorder stamps app events with the same clock, so frames and events share
 *   one timeline (ARCHITECTURE "Timebase").
 * - `send()` takes only a `ScaleCommand` from the whitelist. Commands are written one at a
 *   time, in order, and each is checked with `isWhitelistedCommand()` right before its write
 *   (D-015). `CommandQueue` does both; implementations write through it.
 * - Listeners are called synchronously. One that throws doesn't stop the transport.
 */

import type {
  CharacteristicName,
  CharacteristicProperties,
  DeviceInfo,
  DisconnectReason,
  TransportKind,
} from '../core/model';
import type { ScaleCommand } from '../core/protocol';
import type { Unsubscribe } from './emitter';

/** One BLE notification, as received. */
export interface ScaleNotification {
  readonly source: CharacteristicName;
  /** The bytes, copied out of the browser's buffer. The transport doesn't touch them again. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** When it arrived, on the transport's clock (`now()`), ms. */
  readonly tArrival: number;
}

/** What the recorder logs at connect (`connected` and `characteristic-properties` events). */
export interface ConnectionInfo {
  readonly device: DeviceInfo;
  /** Each characteristic's GATT properties, as the runtime reported them (hardware test A15). */
  readonly properties: {
    readonly ff11: CharacteristicProperties;
    readonly ff12: CharacteristicProperties;
  };
  /**
   * The characteristics notifications come from. FF12 is subscribed only when it can notify
   * or indicate (protocol-notes, finding 14).
   */
  readonly subscribed: readonly CharacteristicName[];
}

export type TransportStatus =
  | {
      readonly state: 'disconnected';
      /** Why the last connection ended, or null before the first one. */
      readonly reason: DisconnectReason | null;
      readonly message: string | null;
    }
  | { readonly state: 'connecting' }
  | { readonly state: 'connected'; readonly connection: ConnectionInfo };

export type TransportErrorCode =
  /** `connect()` while connecting or connected. */
  | 'busy'
  /** The connection attempt failed or was cancelled. */
  | 'connect-failed'
  /** `send()` with no connection. */
  | 'not-connected'
  /** The connection ended before the command was written. */
  | 'disconnected'
  /** The command failed the whitelist check right before its write (D-015). */
  | 'refused'
  /** The write itself failed. */
  | 'write-failed';

export class TransportError extends Error {
  readonly code: TransportErrorCode;

  constructor(code: TransportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TransportError';
    this.code = code;
  }
}

export interface ScaleTransport {
  /** Which implementation this is; the recording stores it. */
  readonly kind: TransportKind;
  readonly status: TransportStatus;

  /**
   * The clock that stamps `tArrival`, in ms. Stamp app events with it too, so they share the
   * frames' timeline.
   */
  now(): number;

  /**
   * Connects to the scale. Web Bluetooth needs a user gesture, so call this synchronously from
   * a click handler, with no `await` before it.
   *
   * @returns once notifications are flowing.
   * @throws TransportError `busy` if not disconnected, or `connect-failed`.
   */
  connect(): Promise<ConnectionInfo>;

  /** Ends the connection, with reason `user`. Does nothing when not connected. */
  disconnect(): Promise<void>;

  /**
   * Queues a command and resolves once it is written.
   *
   * @throws TransportError `not-connected`, `disconnected`, `refused` or `write-failed`.
   */
  send(command: ScaleCommand): Promise<void>;

  onNotification(listener: (notification: ScaleNotification) => void): Unsubscribe;
  onStatus(listener: (status: TransportStatus) => void): Unsubscribe;
}
