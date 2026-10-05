/**
 * Trying the microphone once, for hardware test B8: does the runtime ask for permission, and
 * grant it? Audio pump detection (T3.1) depends on the answer. The stream is stopped as soon as
 * it is granted: nothing is listened to.
 */

export type MicrophoneOutcome =
  /** The browser gave an audio stream. */
  | 'granted'
  /** The user or the browser refused permission (`NotAllowedError`). */
  | 'denied'
  /** Anything else went wrong, such as no microphone. */
  | 'error'
  /** There is no `navigator.mediaDevices.getUserMedia`. */
  | 'unsupported';

export interface MicrophoneResult {
  readonly outcome: MicrophoneOutcome;
  /** The error, as `NotAllowedError: …`; null when granted or unsupported. */
  readonly error: string | null;
  /** The granted stream's track labels, which name the input; empty unless granted. */
  readonly tracks: readonly string[];
}

/** A `MediaStream`, as far as this uses it. Loose, so tests can pass fakes. */
export interface MediaStreamLike {
  getTracks(): readonly { readonly label?: string; stop(): void }[];
}

/** `navigator.mediaDevices`, as far as this uses it. */
export interface MediaDevicesLike {
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
}

/** Error names that mean permission was refused. `PermissionDeniedError` is the old name. */
const DENIED = ['NotAllowedError', 'PermissionDeniedError'];

/**
 * Asks for the microphone, then stops every track of the stream it gets. Call it straight
 * from a tap handler, with nothing awaited before it: browsers ask for permission only during
 * the tap's user activation. Never throws.
 */
export async function tryMicrophone(
  mediaDevices: MediaDevicesLike | undefined = globalThis.navigator?.mediaDevices,
): Promise<MicrophoneResult> {
  const getUserMedia = mediaDevices?.getUserMedia?.bind(mediaDevices);
  if (!getUserMedia) return { outcome: 'unsupported', error: null, tracks: [] };
  try {
    const stream = await getUserMedia({ audio: true });
    const tracks = stream.getTracks();
    for (const track of tracks) track.stop();
    return { outcome: 'granted', error: null, tracks: tracks.map((t) => t.label ?? '') };
  } catch (error) {
    return { ...mediaFailure(error), tracks: [] };
  }
}

/**
 * What a failed `getUserMedia` means: `denied` when permission was refused, `error` otherwise,
 * with the error as `NotAllowedError: …`.
 */
export function mediaFailure(error: unknown): {
  readonly outcome: 'denied' | 'error';
  readonly error: string;
} {
  // Read by shape: a DOMException isn't an Error in every runtime.
  const { name, message } = (error ?? {}) as { name?: unknown; message?: unknown };
  const text =
    typeof name === 'string'
      ? `${name}: ${typeof message === 'string' ? message : ''}`
      : String(error);
  const denied = typeof name === 'string' && DENIED.includes(name);
  return { outcome: denied ? 'denied' : 'error', error: text };
}
