import { createAppEvent, type AppEventDataMap, type AppEventOf, type AppEventType } from './events';
import { createRawFrame, type CharacteristicName, type RawFrame } from './frame';
import { isId, type Id } from './ids';

/**
 * Hands out one recording's sequence numbers, 0, 1, 2, …, to its frames and app events alike,
 * in the order the recorder saw them. `seq` alone then orders everything in a recording, even
 * though frames and events are stored apart (ARCHITECTURE "Storage").
 *
 * The numbers are contiguous. One is used only once its record exists, so a record that fails
 * to construct leaves no gap, and a gap in storage means a lost record.
 */
export class RecordingSequence {
  readonly recordingId: Id;
  #next = 0;

  constructor(recordingId: Id) {
    if (!isId(recordingId)) {
      throw new TypeError(`RecordingSequence: ${JSON.stringify(recordingId)} is not an id`);
    }
    this.recordingId = recordingId;
  }

  /** A frame with the next number. It holds a copy of `bytes`. */
  frame(tMs: number, source: CharacteristicName, bytes: Uint8Array): RawFrame {
    const frame = createRawFrame(this.recordingId, this.#next, tMs, source, bytes);
    this.#next++;
    return frame;
  }

  /** An app event with the next number. */
  event<K extends AppEventType>(tMs: number, type: K, data: AppEventDataMap[K]): AppEventOf<K> {
    const event = createAppEvent(this.recordingId, this.#next, tMs, type, data);
    this.#next++;
    return event;
  }

  /** How many numbers have been used, which is also the next one. */
  get used(): number {
    return this.#next;
  }
}
