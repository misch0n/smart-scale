/**
 * Encodings for automatic export (T1.20): text as UTF-8 base64, which GitHub's contents API
 * carries, and SHA-256 digests, which tell the queue whether a recording's shots changed since
 * its upload (D-030).
 */

import type { JsonValue } from '../../core/model';

/** Bytes per `String.fromCharCode` call: well under every engine's argument limit. */
const CHUNK = 0x8000;

/** `text` as UTF-8, in base64. */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

/**
 * Decodes base64 (line breaks and spaces allowed, as GitHub sends it) as UTF-8 text.
 *
 * @throws Error if it isn't base64, or the bytes aren't UTF-8.
 */
export function base64ToUtf8(base64: string): string {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** The SHA-256 of `text` as UTF-8, in lower-case hex. Needs a secure context in browsers. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * `value` as JSON with every object's keys sorted, so that equal values give equal text
 * whatever order their keys were added in.
 */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items: readonly JsonValue[] = value;
    return `[${items.map(canonicalJson).join(',')}]`;
  }
  const object = value as { readonly [key: string]: JsonValue };
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}
