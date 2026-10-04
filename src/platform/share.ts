/**
 * Sharing a file through the system share sheet (Web Share), for export (T1.7). On iOS the share
 * sheet is the way to Files, iCloud Drive or another app. Hardware test B7 checks what works in
 * beacio and Bluefy: a download, the share sheet, or both.
 */

/** The part of `navigator` that sharing uses. Loose, so tests can pass fakes. */
export interface ShareTarget {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly canShare?: (data?: ShareData) => boolean;
}

/**
 * Whether the share sheet can take this file: `navigator.canShare({ files })`. Having
 * `navigator.share` isn't enough, because a browser may share text and links but not files, or
 * not files of every type.
 */
export function canShareFile(target: ShareTarget | undefined, file: File): boolean {
  if (typeof target?.share !== 'function' || typeof target.canShare !== 'function') return false;
  try {
    return target.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'cancelled';

/**
 * Opens the share sheet with the file. Call it straight from a click handler, with nothing
 * awaited before it: the share sheet needs the click's user activation, which a wait can use up.
 *
 * @returns `cancelled` if the user closed the share sheet.
 * @throws the browser's error if sharing fails otherwise, or TypeError where there is no
 *   `navigator.share`.
 */
export async function shareFile(target: ShareTarget, file: File): Promise<ShareOutcome> {
  if (typeof target.share !== 'function') throw new TypeError('shareFile: no navigator.share');
  try {
    await target.share({ files: [file] });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
