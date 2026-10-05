/**
 * Text for the probe screen (T1.8): times, weights, byte values, statistics, frames, events and
 * the scale's mode (T1.25), written the way the docs write them, so what the screen shows can be compared with the docs
 * and the hardware tests by eye. Bytes are upper-case hex (`0x2B` as `2B`).
 */

import type { ScaleModeState } from '../../app/scale-mode';
import type { SoundCaptureState } from '../../app/sound-capture';
import { TIMER_START_WINDOW_MS, type Summary } from '../../core/live';
import type { AppEvent, CharacteristicProperties } from '../../core/model';
import type { DecodedFrame } from '../../core/protocol';
import { SOUND_FLOOR_DB } from '../../core/sound';
import { soundFlows } from '../../platform/sound-meter';

/** ms since the recording started, as seconds: `12.345 s`. */
export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(3)} s`;
}

/** Grams with the scale's two decimals: `-0.03 g`. */
export function grams(g: number): string {
  return `${g.toFixed(2)} g`;
}

/** One byte as two upper-case hex digits: `2B`. */
export function byte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Spaced hex in lines of `perLine` bytes: a 20-byte frame as bytes 1–10 and 11–20, which fits a
 * phone's width and keeps the spec's 1-based byte numbers easy to count.
 */
export function hexLines(hex: string, perLine = 10): string[] {
  const parts = hex.split(' ').filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += perLine) lines.push(parts.slice(i, i + perLine).join(' '));
  return lines;
}

/** Byte values as a list: `2B, 2D`, or `none`. */
export function bytes(values: readonly number[]): string {
  return values.length === 0 ? 'none' : values.map(byte).join(', ');
}

/** A size in bytes, in kB or MB. */
export function size(bytesCount: number): string {
  if (bytesCount < 1_000_000) return `${(bytesCount / 1000).toFixed(1)} kB`;
  return `${(bytesCount / 1_000_000).toFixed(1)} MB`;
}

/** `100.2 ms (min 98, max 104, σ 1.6, n 99)`, or `none yet`. */
export function gapSummary(summary: Summary | null): string {
  if (summary === null) return 'none yet';
  const { mean, min, max, sd, count } = summary;
  return `${mean.toFixed(1)} ms (min ${round(min)}, max ${round(max)}, σ ${sd.toFixed(1)}, n ${count})`;
}

/** `12.345 g, σ 0.012 g (n 5)`: three decimals, since the noise is below the scale's 0.01 g. */
export function weightSummary(summary: Summary | null): string {
  if (summary === null) return 'no trusted weights';
  return `${summary.mean.toFixed(3)} g, σ ${summary.sd.toFixed(3)} g (n ${summary.count})`;
}

/** A frame in a word or two: what the decoder made of it. */
export function describeFrame(decoded: DecodedFrame): string {
  switch (decoded.kind) {
    case 'weight':
      return `weight ${grams(decoded.weightG)}, timer ${decoded.timerMs} ms`;
    case 'event':
      return `event ${decoded.state ?? `state ${byte(decoded.stateByte)}`}, timer ${decoded.timerMs} ms, ${grams(decoded.weightG)}`;
    case 'powder':
      return `powder ${grams(decoded.powderG)}`;
    case 'unknown':
      return `unknown type ${byte(decoded.productByte)} ${byte(decoded.typeByte)}`;
    case 'invalid':
      return decoded.reason === 'checksum'
        ? 'invalid: bad checksum'
        : `invalid: ${decoded.length} bytes`;
  }
}

/** An app event in one line. */
export function describeEvent(event: AppEvent): string {
  switch (event.type) {
    case 'connected':
      return `connected to ${event.data.deviceName ?? 'a scale with no name'}`;
    case 'disconnected':
      return `disconnected (${event.data.reason})${event.data.message ? `: ${event.data.message}` : ''}`;
    case 'command-sent':
    case 'command-failed': {
      const { command, param, hex, reason } = event.data;
      const what = `${command}${param === null ? '' : ` ${param}`} ${hex}${reason ? ` [${reason}]` : ''}`;
      return event.type === 'command-sent'
        ? `sent ${what}`
        : `FAILED to send ${what}: ${event.data.error}`;
    }
    case 'ui-action':
      return `${event.data.action}${event.data.detail === null ? '' : ` ${JSON.stringify(event.data.detail)}`}`;
    case 'annotation':
      return `annotation ${event.data.label}${event.data.text === null ? '' : `: ${event.data.text}`}`;
    case 'smoothing-confirmed':
      return `smoothing off, confirmed (after ${event.data.attempts} sent)`;
    case 'smoothing-not-confirmed':
      return `smoothing NOT confirmed off after ${event.data.attempts} sent; byte ${
        event.data.smoothingByte === null ? 'never seen' : byte(event.data.smoothingByte)
      }`;
    case 'error':
      return `error${event.data.context ? ` (${event.data.context})` : ''}: ${event.data.message}`;
    case 'characteristic-properties':
      return `${event.data.characteristic.toUpperCase()}: ${properties(event.data.properties)}`;
    case 'sound-started':
      return `sound levels ${event.data.continued ? 'continue' : 'start'}: layout ${event.data.layout}, every ${event.data.intervalMs} ms${event.data.input ? ` (${event.data.input})` : ''}`;
    case 'sound-input': {
      const { contextState, muted } = event.data;
      const flowing = contextState === 'running' && !muted;
      return `sound levels ${flowing ? 'resume' : 'pause'}: audio ${contextState}${muted ? ', input muted' : ''}`;
    }
    case 'sound-stopped':
      return `sound levels stop (${event.data.reason})${event.data.message ? `: ${event.data.message}` : ''}`;
  }
}

/** A sound level: `-42.5 dB`, or `≤ -127.5 dB` at or below the quietest a frame carries. */
export function decibels(db: number): string {
  return db > SOUND_FLOOR_DB ? `${db.toFixed(1)} dB` : `≤ ${SOUND_FLOOR_DB} dB`;
}

/**
 * The sound levels' state, in a line (T1.24). `soundFrames` is how many the recording in
 * progress holds, or null when nothing is recording.
 */
export function soundStatus(state: SoundCaptureState, soundFrames: number | null): string {
  if (state.status === 'starting') return 'Starting: allow the microphone if asked.';
  if (state.status === 'off') return state.problem ? `Off. ${state.problem}` : 'Off.';
  const where =
    soundFrames === null
      ? 'Nothing is recording: they go into the next recording.'
      : `${soundFrames} in this recording.`;
  const { input, description } = state;
  if (input && !soundFlows(input)) {
    return `Paused: audio ${input.contextState}${input.muted ? ', input muted' : ''}. ${where}`;
  }
  const from = description
    ? ` from ${description.input ?? 'the microphone'} at ${description.sampleRateHz} Hz`
    : '';
  const readings = `${state.readings} reading${state.readings === 1 ? '' : 's'}`;
  return `On: ${readings}${from}. ${where}`;
}

/**
 * The scale's mode in a line (T1.25): what the check and the scale's frames say, and what that
 * rests on, as the docs write commands (`04`, `07`).
 */
export function modeStatus(state: ScaleModeState): string {
  const checks = `${state.checks} check${state.checks === 1 ? '' : 's'} sent`;
  const failed = state.error === null ? '' : ` The last check's command failed: ${state.error}.`;
  const { evidence } = state;
  if (state.checking) return `Checking: the 04 is out (${checks}).${failed}`;
  if (evidence === null) {
    const waiting =
      state.checks === 0
        ? 'the check waits for the timer at 0 and no cup on the scale'
        : 'no check could tell yet; it checks again every 5 s';
    return `Not known: ${waiting} (${checks}).${failed}`;
  }
  if (evidence.kind === 'scale-event') {
    const event = `03 0D ${evidence.state ?? 'in a state not known'}`;
    return `NOT the timer mode: the scale sent ${event} at ${seconds(evidence.tMs)}, as its automatic mode does. Switch it on the scale (${checks}).${failed}`;
  }
  const command = `${evidence.command === 'startTimer' ? '04' : '07'} [${evidence.reason ?? 'no reason'}] at ${seconds(evidence.sentTMs)}`;
  if (evidence.kind === 'started') {
    const lag = Math.round(evidence.tMs - evidence.sentTMs);
    return `Timer mode: the ${command} started the timer ${lag} ms later (${checks}).${failed}`;
  }
  return `NOT the timer mode: the ${command} didn't start the timer within ${TIMER_START_WINDOW_MS} ms. Switch it on the scale: the app checks again every 5 s while the scale is idle (${checks}).${failed}`;
}

/** The properties a characteristic has: `notify, write`; those not reported are listed apart. */
export function properties(props: CharacteristicProperties): string {
  const entries = Object.entries(props) as [keyof CharacteristicProperties, boolean | null][];
  const set = entries.filter(([, value]) => value === true).map(([name]) => name);
  const unknown = entries.filter(([, value]) => value === null).map(([name]) => name);
  const parts = [set.length > 0 ? set.join(', ') : 'none'];
  if (unknown.length > 0) parts.push(`not reported: ${unknown.join(', ')}`);
  return parts.join('; ');
}

function round(ms: number): string {
  return Number.isInteger(ms) ? String(ms) : ms.toFixed(1);
}
