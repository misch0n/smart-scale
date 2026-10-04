import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../transport/scheduler';
import { utf8ToBase64 } from './encoding';
import { FakeGitHub, json } from './fake-github';
import { GitHubSink, REQUEST_TIMEOUT_MS, type GitHubSinkOptions } from './github';
import { BackupError, type BackupErrorKind } from './sink';

function setup(
  options: ConstructorParameters<typeof FakeGitHub>[0] = {},
  sink: Partial<GitHubSinkOptions> = {},
) {
  const github = new FakeGitHub(options);
  const made = new GitHubSink({
    owner: github.owner,
    repo: github.repo,
    branch: null,
    token: github.token,
    fetch: github.fetch,
    epochNow: () => 1_800_000_000_000,
    ...sink,
  });
  return { github, sink: made };
}

async function failure(promise: Promise<unknown>): Promise<BackupError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BackupError) return error;
    throw error;
  }
  throw new Error('expected a BackupError');
}

async function expectKind(promise: Promise<unknown>, kind: BackupErrorKind): Promise<BackupError> {
  const error = await failure(promise);
  expect(error.kind).toBe(kind);
  return error;
}

describe('check', () => {
  it('accepts a private repo, and names its default branch', async () => {
    const { github, sink } = setup();
    expect(await sink.check()).toEqual({
      description: 'someone/smart-scale-data (private), default branch main',
    });
    const [request] = github.requests;
    expect(request.method).toBe('GET');
    expect(request.path).toBe('/repos/someone/smart-scale-data');
    expect(request.headers).toEqual({
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${github.token}`,
    });
    expect(request.cache).toBe('no-store');
  });

  it.each([
    ['public', false, 'public'],
    ['internal', true, 'internal'],
  ])('refuses a %s repo, which would publish the recordings', async (_, isPrivate, visibility) => {
    const { sink } = setup({ isPrivate, visibility });
    const error = await expectKind(sink.check(), 'not-private');
    expect(error.message).toContain(`someone/smart-scale-data is ${visibility}`);
  });

  it('refuses a public repo that reports no visibility', async () => {
    const { sink } = setup({ isPrivate: false, visibility: null });
    await expectKind(sink.check(), 'not-private');
  });

  it('refuses an archived repo', async () => {
    const { sink } = setup({ archived: true });
    await expectKind(sink.check(), 'forbidden');
  });

  it('checks that a configured branch exists', async () => {
    const { sink } = setup({ branches: ['backup'] }, { branch: 'backup' });
    expect((await sink.check()).description).toBe(
      'someone/smart-scale-data (private), branch backup',
    );
    const { sink: missing } = setup({}, { branch: 'nope' });
    const error = await expectKind(missing.check(), 'not-found');
    expect(error.message).toContain('has no branch nope');
  });

  it('stops on a refused token, and never repeats the token', async () => {
    const { github, sink } = setup({}, { token: 'github_pat_wrong_wrong_wrong' });
    github.fail(() => json(401, { message: 'Bad credentials for github_pat_wrong_wrong_wrong' }));
    const error = await expectKind(sink.check(), 'unauthorized');
    expect(error.message).toContain('check the settings');
    expect(error.message).not.toContain('github_pat_wrong');
    expect(error.message).toContain('[token]');
  });

  it("stops on a repo the token can't see", async () => {
    const { sink } = setup({}, { repo: 'elsewhere' });
    const error = await expectKind(sink.check(), 'not-found');
    expect(error.message).toContain('404');
  });
});

describe('read', () => {
  it('returns null for a file that is not there', async () => {
    const { sink } = setup();
    expect(await sink.read('recordings/a.json')).toBeNull();
  });

  it('returns a file with its sha, decoding base64 in lines as UTF-8', async () => {
    const { github, sink } = setup();
    const text = `{"note":"Crème, 18 g – ${'x'.repeat(100)}"}\n`;
    const sha = github.plant('recordings/a.json', text);
    expect(await sink.read('recordings/a.json')).toEqual({ text, version: sha });
    expect(github.requests.at(-1)?.headers.accept).toBe('application/vnd.github.object+json');
  });

  it('fetches a file over 1 MB again as raw text', async () => {
    const { github, sink } = setup();
    const text = 'y'.repeat(1024 * 1024 + 1);
    const sha = github.plant('big.json', text);
    expect(await sink.read('big.json')).toEqual({ text, version: sha });
    expect(github.requests.map((r) => r.headers.accept)).toEqual([
      'application/vnd.github.object+json',
      'application/vnd.github.raw+json',
    ]);
  });

  it('reads from the configured branch', async () => {
    const { github, sink } = setup({ branches: ['backup'] }, { branch: 'backup' });
    github.plant('a.json', 'on backup', 'backup');
    expect((await sink.read('a.json'))?.text).toBe('on backup');
    expect(github.requests.at(-1)?.query.get('ref')).toBe('backup');
  });

  it("leaves alone a path that isn't a UTF-8 file", async () => {
    const { github, sink } = setup();
    github.fail((request) =>
      request.method === 'GET'
        ? json(200, { type: 'file', sha: 'abc', encoding: 'base64', content: btoa('\xff\xfe') })
        : null,
    );
    await expectKind(sink.read('a.json'), 'rejected');
    github.fail(() => json(200, { type: 'dir', sha: 'abc' }));
    const error = await expectKind(sink.read('recordings'), 'rejected');
    expect(error.message).toContain('is a dir');
  });

  it('encodes each segment of the path', async () => {
    const { github, sink } = setup();
    await sink.read('my recordings/2026/a#1.json');
    expect(github.requests.at(-1)?.path).toBe(
      '/repos/someone/smart-scale-data/contents/my recordings/2026/a#1.json',
    );
  });
});

describe('write', () => {
  it('creates a file in one commit and returns its sha', async () => {
    const { github, sink } = setup();
    const text = '{"note":"Crème"}\n';
    const sha = await sink.write('recordings/a.json', text, null, 'Add a.json');
    expect(github.file('recordings/a.json')).toBe(text);
    expect(github.commits).toEqual([
      { branch: 'main', path: 'recordings/a.json', message: 'Add a.json' },
    ]);
    expect(await sink.read('recordings/a.json')).toEqual({ text, version: sha });
    const [put] = github.writes;
    expect(put.body).toEqual({ message: 'Add a.json', content: utf8ToBase64(text) });
    expect(put.headers['content-type']).toBe('application/json');
  });

  it('replaces a file at its sha, on the configured branch', async () => {
    const { github, sink } = setup({ branches: ['backup'] }, { branch: 'backup' });
    const first = await sink.write('a.json', 'one', null, 'Add a.json');
    const second = await sink.write('a.json', 'two', first, 'Update a.json');
    expect(second).not.toBe(first);
    expect(github.file('a.json', 'backup')).toBe('two');
    expect(github.writes[1].body).toMatchObject({ sha: first, branch: 'backup' });
  });

  it('reports a conflict when the sha is missing or stale', async () => {
    const { github, sink } = setup();
    const sha = github.plant('a.json', 'theirs');
    await expectKind(sink.write('a.json', 'mine', null, 'Add a.json'), 'conflict');
    await expectKind(sink.write('a.json', 'mine', 'f'.repeat(40), 'Update a.json'), 'conflict');
    expect(github.file('a.json')).toBe('theirs');
    await sink.write('a.json', 'mine', sha, 'Update a.json');
    expect(github.file('a.json')).toBe('mine');
  });

  it('leaves alone a file GitHub finds too large', async () => {
    const { sink } = setup({ maxFileBytes: 10 });
    const error = await expectKind(sink.write('a.json', 'x'.repeat(11), null, 'Add'), 'rejected');
    expect(error.message).toContain('too large');
  });

  it('stops when the token may only read', async () => {
    const { sink } = setup({ canWrite: false });
    const error = await expectKind(sink.write('a.json', 'x', null, 'Add'), 'forbidden');
    expect(error.message).toContain('Contents read and write');
  });

  it('reports an answer without a sha as unexpected', async () => {
    const { github, sink } = setup();
    github.fail(() => json(201, { content: null }));
    await expectKind(sink.write('a.json', 'x', null, 'Add'), 'unexpected');
  });
});

describe('failures to retry', () => {
  it('tells a rate limit from a refusal, with how long to wait', async () => {
    const { github, sink } = setup();
    const reset = 1_800_000_000 + 90; // epoch s, 90 s after the sink's clock
    github.fail(() =>
      json(
        403,
        { message: 'API rate limit exceeded' },
        { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
      ),
    );
    expect((await expectKind(sink.check(), 'rate-limited')).retryAfterMs).toBe(90_000);

    github.fail(() => json(429, { message: 'Too many' }, { 'retry-after': '60' }));
    expect((await expectKind(sink.check(), 'rate-limited')).retryAfterMs).toBe(60_000);

    github.fail(() => json(403, { message: 'You have exceeded a secondary rate limit.' }));
    expect((await expectKind(sink.check(), 'rate-limited')).retryAfterMs).toBeNull();
  });

  it('retries a server failure, a lost connection and an answer that is not JSON', async () => {
    const { github, sink } = setup();
    github.fail(() => json(502, { message: 'Server Error' }));
    await expectKind(sink.check(), 'unavailable');
    github.fail(() => new TypeError('Load failed'));
    const lost = await expectKind(sink.check(), 'network');
    expect(lost.message).toContain('Load failed');
    github.fail(() => new Response('<html>busy</html>', { status: 200 }));
    await expectKind(sink.check(), 'unexpected');
  });

  it('gives up on a request after the timeout', async () => {
    const clock = new ManualClock();
    const hanging = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      });
    const sink = new GitHubSink({
      owner: 'someone',
      repo: 'data',
      branch: null,
      token: 'github_pat_secret_secret',
      fetch: hanging,
      timers: clock,
    });
    const checking = failure(sink.check());
    clock.advance(REQUEST_TIMEOUT_MS);
    const error = await checking;
    expect(error.kind).toBe('network');
    expect(error.message).toContain("didn't answer within 120 s");
    expect(clock.pendingTimers).toBe(0);
  });

  it('clears its timeout once answered', async () => {
    const clock = new ManualClock();
    const { sink } = setup({}, { timers: clock });
    await sink.check();
    expect(clock.pendingTimers).toBe(0);
  });
});
