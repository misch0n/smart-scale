/**
 * Test support, for tests only: an in-memory stand-in for the part of GitHub's REST API that the
 * GitHub sink uses (T1.20), as a `fetch`. It checks what GitHub and a browser would check: the
 * token, the request headers that GitHub's CORS preflight allows, and the `sha` of an update.
 * Tests script failures with `fail()`.
 */

import { base64ToUtf8, utf8ToBase64 } from './encoding';
import type { FetchLike } from './github';

/** Request headers GitHub's CORS preflight allows, plus the CORS-safelisted `Accept`. */
const ALLOWED_HEADERS = new Set([
  'accept',
  'authorization',
  'content-type',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-unmodified-since',
  'x-requested-with',
]);

/** GitHub sends file content in a JSON object only up to 1 MB. */
const MAX_OBJECT_CONTENT_BYTES = 1024 * 1024;

export interface FakeGitHubOptions {
  readonly owner?: string;
  readonly repo?: string;
  readonly token?: string;
  readonly isPrivate?: boolean;
  /** `private`, `public` or `internal`; null to leave the field out. Default: from isPrivate. */
  readonly visibility?: string | null;
  readonly defaultBranch?: string;
  /** Branches besides the default one. */
  readonly branches?: readonly string[];
  readonly archived?: boolean;
  /** False: the token may read but not write (403 on PUT). */
  readonly canWrite?: boolean;
  /** The largest file a PUT may write, bytes; larger is 422, as GitHub does near 50 MB. */
  readonly maxFileBytes?: number;
}

export interface FakeRequest {
  readonly method: string;
  /** The URL's path, decoded, like `/repos/someone/data/contents/recordings/a.json`. */
  readonly path: string;
  readonly query: URLSearchParams;
  /** Header names in lower case. */
  readonly headers: Readonly<Record<string, string>>;
  /** The parsed JSON body, or null. */
  readonly body: unknown;
  readonly cache: RequestCache | undefined;
}

export interface FakeCommit {
  readonly branch: string;
  readonly path: string;
  readonly message: string;
}

interface StoredFile {
  readonly text: string;
  readonly sha: string;
}

type Script = (request: FakeRequest) => Response | Error | null;

export class FakeGitHub {
  readonly owner: string;
  readonly repo: string;
  token: string;
  isPrivate: boolean;
  visibility: string | null;
  readonly defaultBranch: string;
  readonly branches: Set<string>;
  archived: boolean;
  canWrite: boolean;
  maxFileBytes: number;
  /** Every request, in order, scripted ones included. */
  readonly requests: FakeRequest[] = [];
  /** Every commit a PUT made, in order. */
  readonly commits: FakeCommit[] = [];
  readonly #files = new Map<string, Map<string, StoredFile>>();
  #scripts: Script[] = [];
  #shas = 0;

  constructor(options: FakeGitHubOptions = {}) {
    this.owner = options.owner ?? 'someone';
    this.repo = options.repo ?? 'smart-scale-data';
    this.token = options.token ?? 'github_pat_11ABCDEFG0123456789_secretsecretsecret';
    this.isPrivate = options.isPrivate ?? true;
    this.visibility =
      options.visibility === undefined
        ? this.isPrivate
          ? 'private'
          : 'public'
        : options.visibility;
    this.defaultBranch = options.defaultBranch ?? 'main';
    this.branches = new Set([this.defaultBranch, ...(options.branches ?? [])]);
    this.archived = options.archived ?? false;
    this.canWrite = options.canWrite ?? true;
    this.maxFileBytes = options.maxFileBytes ?? 50 * 1024 * 1024;
  }

  /** The fake, as `fetch`. */
  readonly fetch: FetchLike = (url, init) => {
    const request = this.#record(url, init);
    for (let i = 0; i < this.#scripts.length; i++) {
      const answer = this.#scripts[i](request);
      if (answer === null) continue;
      this.#scripts.splice(i, 1);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    }
    const forbidden = Object.keys(request.headers).find((name) => !ALLOWED_HEADERS.has(name));
    if (forbidden !== undefined) {
      // What a browser does when the preflight doesn't allow a header.
      return Promise.reject(new TypeError(`Failed to fetch (CORS: ${forbidden} not allowed)`));
    }
    return Promise.resolve(this.#answer(request));
  };

  /**
   * The next request that `script` answers (with a response, or an error to reject with) gets
   * that answer instead of the fake's own, once. Return null to let a request through.
   */
  fail(script: Script): void {
    this.#scripts.push(script);
  }

  /** The file's text, or undefined. */
  file(path: string, branch = this.defaultBranch): string | undefined {
    return this.#files.get(branch)?.get(path)?.text;
  }

  /** Every file's path on the branch, sorted. */
  paths(branch = this.defaultBranch): string[] {
    return [...(this.#files.get(branch)?.keys() ?? [])].sort();
  }

  /** Stores a file directly, as another device would have: returns its sha. */
  plant(path: string, text: string, branch = this.defaultBranch): string {
    const sha = this.#nextSha();
    this.#branchFiles(branch).set(path, { text, sha });
    return sha;
  }

  /** The PUT requests, in order. */
  get writes(): readonly FakeRequest[] {
    return this.requests.filter((request) => request.method === 'PUT');
  }

  #record(url: string, init: RequestInit): FakeRequest {
    const parsed = new URL(url);
    const headers: Record<string, string> = {};
    for (const [name, value] of new Headers(init.headers).entries()) headers[name] = value;
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
    const request: FakeRequest = {
      method: init.method ?? 'GET',
      path: decodeURIComponent(parsed.pathname),
      query: parsed.searchParams,
      headers,
      body,
      cache: init.cache,
    };
    this.requests.push(request);
    return request;
  }

  #answer(request: FakeRequest): Response {
    if (request.headers.authorization !== `Bearer ${this.token}`) {
      return json(401, { message: 'Bad credentials' });
    }
    const prefix = `/repos/${this.owner}/${this.repo}`;
    if (request.path !== prefix && !request.path.startsWith(`${prefix}/`)) {
      return json(404, { message: 'Not Found' });
    }
    const rest = request.path.slice(prefix.length);
    if (request.method === 'GET' && rest === '') return this.#repoAnswer();
    if (request.method === 'GET' && rest.startsWith('/branches/')) {
      const branch = rest.slice('/branches/'.length);
      return this.branches.has(branch)
        ? json(200, { name: branch })
        : json(404, { message: 'Branch not found' });
    }
    if (rest.startsWith('/contents/')) {
      const path = rest.slice('/contents/'.length);
      if (request.method === 'GET') return this.#getContents(request, path);
      if (request.method === 'PUT') return this.#putContents(request, path);
    }
    return json(404, { message: 'Not Found' });
  }

  #repoAnswer(): Response {
    const repo: Record<string, unknown> = {
      full_name: `${this.owner}/${this.repo}`,
      private: this.isPrivate,
      default_branch: this.defaultBranch,
      archived: this.archived,
    };
    if (this.visibility !== null) repo.visibility = this.visibility;
    return json(200, repo);
  }

  #getContents(request: FakeRequest, path: string): Response {
    const branch = request.query.get('ref') ?? this.defaultBranch;
    if (!this.branches.has(branch)) {
      return json(404, { message: `No commit found for the ref ${branch}` });
    }
    const file = this.#files.get(branch)?.get(path);
    if (file === undefined) return json(404, { message: 'Not Found' });
    const size = new TextEncoder().encode(file.text).length;
    const accept = request.headers.accept ?? '';
    if (accept === 'application/vnd.github.raw+json') {
      return new Response(file.text, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    const small = size <= MAX_OBJECT_CONTENT_BYTES;
    if (accept !== 'application/vnd.github.object+json' && !small) {
      return json(403, { message: 'This API returns blobs up to 1 MB in size.' });
    }
    return json(200, {
      type: 'file',
      path,
      sha: file.sha,
      size,
      encoding: small ? 'base64' : 'none',
      // GitHub breaks its base64 into lines of 60 characters.
      content: small ? (utf8ToBase64(file.text).match(/.{1,60}/g) ?? []).join('\n') : '',
    });
  }

  #putContents(request: FakeRequest, path: string): Response {
    if (!this.canWrite) {
      return json(403, { message: 'Resource not accessible by personal access token' });
    }
    if (this.archived) {
      return json(403, { message: 'Repository was archived so is read-only.' });
    }
    const body = request.body as Record<string, unknown> | null;
    if (body === null || typeof body.message !== 'string' || typeof body.content !== 'string') {
      return json(422, { message: 'Invalid request.' });
    }
    const branch = typeof body.branch === 'string' ? body.branch : this.defaultBranch;
    if (!this.branches.has(branch)) return json(404, { message: `Branch ${branch} not found` });
    const text = base64ToUtf8(body.content);
    if (new TextEncoder().encode(text).length > this.maxFileBytes) {
      return json(422, {
        message:
          'Sorry, the file is too large to be processed. Consider creating/updating the file in a local clone and pushing it to GitHub.',
      });
    }
    const files = this.#branchFiles(branch);
    const existing = files.get(path);
    if (existing !== undefined && body.sha === undefined) {
      return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
    }
    if (body.sha !== undefined && body.sha !== existing?.sha) {
      const sha = typeof body.sha === 'string' ? body.sha : JSON.stringify(body.sha);
      return json(409, { message: `${path} does not match ${sha}` });
    }
    const sha = this.#nextSha();
    files.set(path, { text, sha });
    this.commits.push({ branch, path, message: body.message });
    return json(existing === undefined ? 201 : 200, {
      content: { name: path.split('/').at(-1), path, sha },
      commit: { sha: `commit-${sha}`, message: body.message },
    });
  }

  #branchFiles(branch: string): Map<string, StoredFile> {
    let files = this.#files.get(branch);
    if (files === undefined) {
      files = new Map();
      this.#files.set(branch, files);
    }
    return files;
  }

  #nextSha(): string {
    this.#shas++;
    return this.#shas.toString(16).padStart(40, '0');
  }
}

/** A JSON response, as GitHub sends them. */
export function json(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
