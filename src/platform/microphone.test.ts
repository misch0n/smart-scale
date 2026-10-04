import { describe, expect, it } from 'vitest';
import { tryMicrophone, type MediaDevicesLike, type MediaStreamLike } from './microphone';

function fakeStream(labels: string[]) {
  const stopped: string[] = [];
  const stream: MediaStreamLike = {
    getTracks: () => labels.map((label) => ({ label, stop: () => stopped.push(label) })),
  };
  return { stream, stopped };
}

describe('tryMicrophone', () => {
  it('asks for audio only, and stops every track it is given', async () => {
    const { stream, stopped } = fakeStream(['iPhone Microphone']);
    const asked: MediaStreamConstraints[] = [];
    const devices: MediaDevicesLike = {
      getUserMedia: (constraints) => {
        asked.push(constraints);
        return Promise.resolve(stream);
      },
    };
    const result = tryMicrophone(devices);
    // Asked synchronously, so the request keeps the tap's user activation.
    expect(asked).toEqual([{ audio: true }]);
    expect(await result).toEqual({
      outcome: 'granted',
      error: null,
      tracks: ['iPhone Microphone'],
    });
    expect(stopped).toEqual(['iPhone Microphone']);
  });

  it('calls getUserMedia on mediaDevices, as browsers require', async () => {
    const { stream } = fakeStream([]);
    const devices = {
      getUserMedia(this: unknown) {
        expect(this).toBe(devices);
        return Promise.resolve(stream);
      },
    };
    expect((await tryMicrophone(devices)).outcome).toBe('granted');
  });

  it('reports a refusal as denied', async () => {
    const denied = new DOMException('Permission denied', 'NotAllowedError');
    const result = await tryMicrophone({ getUserMedia: () => Promise.reject(denied) });
    expect(result).toEqual({
      outcome: 'denied',
      error: 'NotAllowedError: Permission denied',
      tracks: [],
    });
  });

  it('reports other failures as errors, whatever was thrown', async () => {
    const missing = new DOMException('Requested device not found', 'NotFoundError');
    expect(await tryMicrophone({ getUserMedia: () => Promise.reject(missing) })).toEqual({
      outcome: 'error',
      error: 'NotFoundError: Requested device not found',
      tracks: [],
    });
    expect(
      await tryMicrophone({
        getUserMedia: () => {
          throw 'shim failure'; // eslint-disable-line @typescript-eslint/only-throw-error
        },
      }),
    ).toEqual({ outcome: 'error', error: 'shim failure', tracks: [] });
  });

  it('reports a missing API as unsupported', async () => {
    expect(await tryMicrophone(undefined)).toEqual({
      outcome: 'unsupported',
      error: null,
      tracks: [],
    });
    expect((await tryMicrophone({})).outcome).toBe('unsupported');
  });
});
