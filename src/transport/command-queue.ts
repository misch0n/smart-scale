/**
 * Serialises command writes: one in flight, a pause after each, and the whitelist check right
 * before every write (D-015). Web Bluetooth rejects overlapping GATT operations, and the BOOKOO
 * clients we know of space writes about 100 ms apart (protocol-notes, finding 13). Every
 * transport writes through this queue, so none can skip the check.
 */

import { isWhitelistedCommand, type ScaleCommand } from '../core/protocol';
import type { Scheduler } from './scheduler';
import { TransportError } from './types';

/**
 * Writes one command's bytes, which are a copy taken right after the whitelist check. Return a
 * promise for an asynchronous write, or nothing for one that finishes at once. Throw or reject
 * to fail it.
 */
export type CommandWriter = (
  bytes: Uint8Array<ArrayBuffer>,
  command: ScaleCommand,
) => void | Promise<void>;

interface Queued {
  readonly command: ScaleCommand;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

export class CommandQueue {
  readonly #write: CommandWriter;
  readonly #scheduler: Scheduler;
  readonly #spacingMs: number;
  #queue: Queued[] = [];
  #busy = false;

  /**
   * @param spacingMs the pause after each write completes before the next one starts.
   */
  constructor(write: CommandWriter, scheduler: Scheduler, spacingMs: number) {
    this.#write = write;
    this.#scheduler = scheduler;
    this.#spacingMs = spacingMs;
  }

  /** Commands waiting, not counting one being written. */
  get pending(): number {
    return this.#queue.length;
  }

  /**
   * Queues a command. When the queue is idle it's written at once, synchronously.
   *
   * @returns a promise that resolves once the write completes.
   * @throws TransportError `refused` (rejected) if the command fails the whitelist check when
   *   its turn comes, or `write-failed` if the write fails.
   */
  enqueue(command: ScaleCommand): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.#queue.push({ command, resolve, reject });
      this.#next();
    });
  }

  /** Rejects every command still waiting with `error`. A write in flight finishes on its own. */
  clear(error: Error): void {
    const dropped = this.#queue;
    this.#queue = [];
    for (const item of dropped) item.reject(error);
  }

  #next(): void {
    if (this.#busy) return;
    const item = this.#queue.shift();
    if (!item) return;
    // The check and the copy happen together, right before the write: a command whose bytes
    // were changed while it waited is refused, and nothing can change the copy (D-015).
    if (!isWhitelistedCommand(item.command)) {
      item.reject(
        new TransportError(
          'refused',
          `Refused to write ${describe(item.command)}: it isn't a command from the whitelist (D-015)`,
        ),
      );
      this.#next();
      return;
    }
    const bytes = item.command.bytes.slice();
    this.#busy = true;
    const done = (error?: unknown): void => {
      if (error === undefined) item.resolve();
      else item.reject(asWriteError(error, item.command));
      this.#scheduler.setTimeout(() => {
        this.#busy = false;
        this.#next();
      }, this.#spacingMs);
    };
    let result: void | Promise<void>;
    try {
      result = this.#write(bytes, item.command);
    } catch (error) {
      done(error ?? new Error('write failed'));
      return;
    }
    if (result instanceof Promise) {
      result.then(
        () => done(),
        (error: unknown) => done(error ?? new Error('write failed')),
      );
    } else {
      done();
    }
  }
}

function describe(command: ScaleCommand): string {
  const name = (command as { name?: unknown }).name;
  return typeof name === 'string' ? `"${name}"` : 'a command';
}

function asWriteError(error: unknown, command: ScaleCommand): Error {
  if (error instanceof TransportError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new TransportError('write-failed', `Writing ${describe(command)} failed: ${message}`, {
    cause: error,
  });
}
