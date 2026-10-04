/**
 * The GitHub destination (T1.20, D-027): a private repo the user owns, written through the REST
 * contents API with a fine-grained personal access token entered on the device.
 *
 * - `check()` reads the repo (`GET /repos/{owner}/{repo}`) and refuses one that isn't private,
 *   because writing to it would publish the recordings. A configured branch must exist.
 * - `read()` uses the `object` media type, which gives the blob `sha` for files of any size up
 *   to 100 MB, and the content itself up to 1 MB. A larger file's text is fetched again with the
 *   `raw` media type.
 * - `write()` is `PUT /repos/{owner}/{repo}/contents/{path}`: one commit per file, with the
 *   replaced file's `sha` (GitHub answers 409, or 422 without a `sha`, when it doesn't match).
 *   GitHub takes files of 10 MB this way and refuses ones near 50 MB (422, "too large").
 *
 * `api.github.com` answers CORS requests from any origin. Requests carry only `Accept`,
 * `Authorization` and `Content-Type`: GitHub's preflight doesn't allow `X-GitHub-Api-Version`,
 * so the default API version (2022-11-28) applies. Responses aren't cached (`no-store`): a
 * cached `sha` would make every update conflict. The token is never put into a message
 * (`redact`), and the class holds it in a private field.
 */

import type { Timers } from '../../storage';
import { base64ToUtf8, utf8ToBase64 } from './encoding';
import {
  BackupError,
  redact,
  type BackupErrorKind,
  type BackupSink,
  type RemoteFile,
  type SinkCheck,
} from './sink';

export const GITHUB_API = 'https://api.github.com';

/** How long one request, its answer included, may take before it counts as failed, ms. */
export const REQUEST_TIMEOUT_MS = 120_000;

/** `fetch`, or a test's stand-in. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubSinkOptions {
  readonly owner: string;
  readonly repo: string;
  /** The branch to read and write; null for the repo's default branch. */
  readonly branch: string | null;
  /** A fine-grained personal access token with Contents read and write on the repo. */
  readonly token: string;
  /** Default: the global `fetch`. */
  readonly fetch?: FetchLike;
  /** For the request timeout. Default: the global timers. */
  readonly timers?: Timers;
  /** Default `REQUEST_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
  /** The wall clock, to read when a rate limit resets. Default `Date.now`. */
  readonly epochNow?: () => number;
}

const GLOBAL_TIMERS: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
};

/** Unbound, `fetch` throws "Illegal invocation" in browsers. */
const globalFetch: FetchLike = (url, init) => globalThis.fetch(url, init);

/** The most of GitHub's own error message a BackupError quotes. */
const MAX_DETAIL = 200;

export class GitHubSink implements BackupSink {
  readonly #owner: string;
  readonly #repo: string;
  readonly #branch: string | null;
  readonly #token: string;
  readonly #fetch: FetchLike;
  readonly #timers: Timers;
  readonly #timeoutMs: number;
  readonly #epochNow: () => number;

  constructor(options: GitHubSinkOptions) {
    this.#owner = options.owner;
    this.#repo = options.repo;
    this.#branch = options.branch;
    this.#token = options.token;
    this.#fetch = options.fetch ?? globalFetch;
    this.#timers = options.timers ?? GLOBAL_TIMERS;
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.#epochNow = options.epochNow ?? Date.now;
  }

  /** `owner/repo`, as entered. */
  get name(): string {
    return `${this.#owner}/${this.#repo}`;
  }

  async check(): Promise<SinkCheck> {
    const doing = `Checking ${this.name}`;
    const repo = await this.#call(doing, 'GET', this.#repoPath(), {}, async (response) => {
      if (!response.ok) throw await this.#failure(response, doing);
      return this.#parseRepo(await this.#json(response, doing), doing);
    });
    if (!repo.isPrivate) {
      throw this.#error(
        'not-private',
        `${repo.fullName} is ${repo.visibility}. Automatic export writes only to a private repo, because it would publish the recordings: make it private, or pick another.`,
      );
    }
    if (repo.archived) {
      throw this.#error(
        'forbidden',
        `${repo.fullName} is archived, so it is read-only. Unarchive it, or pick another repo.`,
      );
    }
    const branch = this.#branch;
    if (branch === null) {
      return { description: `${repo.fullName} (private), default branch ${repo.defaultBranch}` };
    }
    const checking = `Checking branch ${branch} of ${repo.fullName}`;
    const path = `${this.#repoPath()}/branches/${encodePath(branch)}`;
    await this.#call(checking, 'GET', path, {}, async (response) => {
      if (response.status === 404) {
        await discard(response);
        throw this.#error(
          'not-found',
          `${repo.fullName} has no branch ${branch}. Leave the branch empty to use the default one, ${repo.defaultBranch}.`,
        );
      }
      if (!response.ok) throw await this.#failure(response, checking);
      await discard(response);
    });
    return { description: `${repo.fullName} (private), branch ${branch}` };
  }

  async read(path: string): Promise<RemoteFile | null> {
    const doing = `Reading ${path} from ${this.name}`;
    const url = this.#contentsPath(path) + this.#refQuery();
    const accept = 'application/vnd.github.object+json';
    const found = await this.#call(doing, 'GET', url, { accept }, async (response) => {
      if (response.status === 404) {
        await discard(response);
        return null;
      }
      if (!response.ok) throw await this.#failure(response, doing);
      return this.#parseContent(await this.#json(response, doing), path, doing);
    });
    if (found === null) return null;
    if (found.text !== null) return { text: found.text, version: found.sha };
    // Over 1 MB the object has no content: fetch the text itself.
    const raw = 'application/vnd.github.raw+json';
    const text = await this.#call(doing, 'GET', url, { accept: raw }, async (response) => {
      if (response.status === 404) {
        await discard(response);
        throw this.#error('conflict', `${doing}: it went away while being read`);
      }
      if (!response.ok) throw await this.#failure(response, doing);
      return response.text();
    });
    return { text, version: found.sha };
  }

  async write(path: string, text: string, replacing: string | null, note: string): Promise<string> {
    const doing = `Writing ${path} to ${this.name}`;
    const body: Record<string, string> = { message: note, content: utf8ToBase64(text) };
    if (replacing !== null) body.sha = replacing;
    if (this.#branch !== null) body.branch = this.#branch;
    return this.#call(doing, 'PUT', this.#contentsPath(path), { body }, async (response) => {
      if (!response.ok) throw await this.#failure(response, doing);
      const json = await this.#json(response, doing);
      const sha = isRecord(json) && isRecord(json.content) ? json.content.sha : undefined;
      if (typeof sha !== 'string') {
        throw this.#error('unexpected', `${doing}: GitHub's answer has no content.sha`);
      }
      return sha;
    });
  }

  /**
   * Makes one request and hands its response to `handle`. The timeout covers reading the
   * answer too. A request that fails on the way is a `network` error.
   */
  async #call<T>(
    doing: string,
    method: 'GET' | 'PUT',
    path: string,
    request: { readonly accept?: string; readonly body?: unknown },
    handle: (response: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = this.#timers.setTimeout(() => controller.abort(), this.#timeoutMs);
    const headers: Record<string, string> = {
      Accept: request.accept ?? 'application/vnd.github+json',
      Authorization: `Bearer ${this.#token}`,
    };
    if (request.body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      let response: Response;
      try {
        response = await this.#fetch(`${GITHUB_API}${path}`, {
          method,
          headers,
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
          cache: 'no-store',
          signal: controller.signal,
        });
      } catch (error) {
        throw this.#networkError(doing, controller.signal.aborted, error);
      }
      try {
        return await handle(response);
      } catch (error) {
        if (error instanceof BackupError) throw error;
        throw this.#networkError(doing, controller.signal.aborted, error);
      }
    } finally {
      this.#timers.clearTimeout(timer);
    }
  }

  #networkError(doing: string, timedOut: boolean, error: unknown): BackupError {
    const message = timedOut
      ? `${doing}: GitHub didn't answer within ${Math.round(this.#timeoutMs / 1000)} s`
      : `${doing}: the request failed (${errorText(error)}). Is the phone online?`;
    return this.#error('network', message, { cause: error });
  }

  /** The error for a response that isn't a success. */
  async #failure(response: Response, doing: string): Promise<BackupError> {
    const detail = await githubMessage(response);
    const status = response.status;
    const said = detail === '' ? `${status}` : `${status}: ${detail}`;
    if (status === 401) {
      return this.#error(
        'unauthorized',
        `${doing}: GitHub refused the token (${said}). It may be wrong, expired or revoked: check the settings.`,
      );
    }
    if (status === 429 || (status === 403 && isRateLimit(response, detail))) {
      return this.#error('rate-limited', `${doing}: GitHub's rate limit (${said})`, {
        retryAfterMs: retryAfterMs(response, this.#epochNow()),
      });
    }
    if (status === 403) {
      return this.#error(
        'forbidden',
        `${doing}: GitHub refused (${said}). The token needs Contents read and write on this repo: check the settings.`,
      );
    }
    if (status === 404) {
      return this.#error(
        'not-found',
        `${doing}: GitHub found nothing there for this token (${said}). Check the settings: the owner, the repo, and that the token has access to the repo.`,
      );
    }
    if (status === 409 || (status === 422 && /\bsha\b/i.test(detail))) {
      return this.#error('conflict', `${doing}: the file changed in the meantime (${said})`);
    }
    if (status >= 500) return this.#error('unavailable', `${doing}: GitHub failed (${said})`);
    return this.#error('rejected', `${doing}: GitHub refused it (${said})`);
  }

  #error(
    kind: BackupErrorKind,
    message: string,
    options?: { readonly retryAfterMs?: number | null; readonly cause?: unknown },
  ): BackupError {
    return new BackupError(kind, redact(message, this.#token), options);
  }

  /** The answer as JSON. A failure to read it is `#call`'s to report, timeout or not. */
  async #json(response: Response, doing: string): Promise<unknown> {
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw this.#error('unexpected', `${doing}: GitHub's answer isn't JSON`);
    }
  }

  #parseRepo(json: unknown, doing: string) {
    if (
      !isRecord(json) ||
      typeof json.private !== 'boolean' ||
      typeof json.full_name !== 'string' ||
      typeof json.default_branch !== 'string'
    ) {
      throw this.#error('unexpected', `${doing}: GitHub's answer doesn't describe a repo`);
    }
    const visibility = typeof json.visibility === 'string' ? json.visibility : null;
    return {
      fullName: json.full_name,
      // `internal` repos are visible to a whole enterprise: not private enough.
      isPrivate: json.private && (visibility === null || visibility === 'private'),
      visibility: visibility ?? (json.private ? 'private' : 'public'),
      defaultBranch: json.default_branch,
      archived: json.archived === true,
    };
  }

  #parseContent(json: unknown, path: string, doing: string) {
    if (!isRecord(json) || typeof json.type !== 'string') {
      throw this.#error('unexpected', `${doing}: GitHub's answer doesn't describe a file`);
    }
    if (json.type !== 'file') {
      throw this.#error('rejected', `${path} is a ${json.type} in ${this.name}, not a file`);
    }
    if (typeof json.sha !== 'string') {
      throw this.#error('unexpected', `${doing}: GitHub's answer has no sha`);
    }
    if (json.encoding !== 'base64' || typeof json.content !== 'string') {
      return { sha: json.sha, text: null };
    }
    try {
      return { sha: json.sha, text: base64ToUtf8(json.content) };
    } catch {
      throw this.#error('rejected', `${path} in ${this.name} isn't UTF-8 text`);
    }
  }

  #repoPath(): string {
    return `/repos/${encodeURIComponent(this.#owner)}/${encodeURIComponent(this.#repo)}`;
  }

  #contentsPath(path: string): string {
    return `${this.#repoPath()}/contents/${encodePath(path)}`;
  }

  #refQuery(): string {
    return this.#branch === null ? '' : `?ref=${encodeURIComponent(this.#branch)}`;
  }
}

/** A path for a URL: each segment encoded, the slashes kept. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `message` of GitHub's JSON error body, shortened; '' when there is none. */
async function githubMessage(response: Response): Promise<string> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return '';
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return ''; // an HTML page from a proxy, say: nothing worth quoting
  }
  if (!isRecord(json) || typeof json.message !== 'string') return '';
  const message = json.message.replace(/\s+/g, ' ').trim();
  return message.length > MAX_DETAIL ? `${message.slice(0, MAX_DETAIL)}…` : message;
}

/**
 * Whether a 403 is a rate limit rather than a refusal: the primary limit says so in
 * `x-ratelimit-remaining`, a secondary one in `retry-after` or its message.
 */
function isRateLimit(response: Response, detail: string): boolean {
  return (
    response.headers.get('x-ratelimit-remaining') === '0' ||
    response.headers.has('retry-after') ||
    /rate limit/i.test(detail)
  );
}

/** How long GitHub asked to wait, ms, or null if it didn't say. */
function retryAfterMs(response: Response, nowEpochMs: number): number | null {
  const seconds = Number(response.headers.get('retry-after') ?? Number.NaN);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const resetSeconds = Number(response.headers.get('x-ratelimit-reset') ?? Number.NaN);
  if (response.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(resetSeconds)) {
    return Math.max(0, resetSeconds * 1000 - nowEpochMs);
  }
  return null;
}

/** Drops a response's body, which isn't needed. */
async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // It is gone either way.
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
