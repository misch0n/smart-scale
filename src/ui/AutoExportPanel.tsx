import { useState } from 'preact/hooks';
import {
  DEFAULT_PATH_PREFIX,
  SettingsError,
  type AutoExport,
  type SettingsDraft,
} from '../app/auto-export';
import { shortId } from '../core/model';
import { describeAutoExport } from './auto-export-text';
import { useLiveUpdates } from './use-live-updates';

// Automatic export (T1.20, D-027): its status, and its settings. Rudimentary until T3.5. The
// token field is write-only: once saved, the panel says only that a token is set, and offers
// Replace and Remove. Nothing here ever shows the token.

export function AutoExportPanel({ autoExport }: { autoExport: AutoExport }) {
  useLiveUpdates((notify) => autoExport.onChange(notify), [autoExport]);
  const status = autoExport.status;
  const settings = autoExport.settings;
  const [owner, setOwner] = useState(settings?.owner ?? '');
  const [repo, setRepo] = useState(settings?.repo ?? '');
  const [branch, setBranch] = useState(settings?.branch ?? '');
  const [pathPrefix, setPathPrefix] = useState(settings?.pathPrefix ?? DEFAULT_PATH_PREFIX);
  const [token, setToken] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ readonly text: string; readonly warn: boolean } | null>(
    null,
  );

  const tokenSet = settings?.tokenSet ?? false;
  const askToken = !tokenSet || replacing;

  /** The form as a draft. An empty token field keeps the stored token, if there is one. */
  function draft(): SettingsDraft {
    const typed = token.trim();
    return {
      owner,
      repo,
      branch,
      pathPrefix,
      token: typed !== '' ? typed : tokenSet ? undefined : null,
    };
  }

  async function act(run: () => Promise<string>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await run(), warn: false });
    } catch (error) {
      setMessage({ text: errorText(error), warn: true });
    } finally {
      setBusy(false);
    }
  }

  const save = (next: SettingsDraft, done: string) =>
    act(async () => {
      await autoExport.save(next);
      setToken('');
      setReplacing(false);
      return done;
    });

  const test = () => act(async () => `It works: ${(await autoExport.test(draft())).description}.`);

  return (
    <section data-testid="auto-export">
      <h2>Automatic export</h2>
      <p
        class={status.state === 'waiting' || status.state === 'stopped' ? 'box warn' : 'box'}
        data-testid="auto-export-status"
      >
        {describeAutoExport(status, settings, (epochMs) => new Date(epochMs).toLocaleString())}
        {(status.state === 'waiting' || status.state === 'stopped') && (
          <>
            {' '}
            <button type="button" onClick={() => autoExport.retry()}>
              Retry now
            </button>
          </>
        )}
      </p>
      {status.held.length > 0 && (
        <ul data-testid="auto-export-held">
          {status.held.map((held) => (
            <li key={held.id}>
              Recording <code>{shortId(held.id)}</code> wasn't uploaded. {held.reason}{' '}
              <span class="muted">{held.path}</span>
            </li>
          ))}
        </ul>
      )}
      <details open={settings === null}>
        <summary>Settings</summary>
        <p class="muted">
          Each recording goes to a private GitHub repo as one file, once it ends, and again when its
          shots change. Simulator recordings stay on the phone. The token stays on this phone too:
          create a fine-grained one for the data repo alone, with Contents read and write.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(draft(), 'Saved.');
          }}
        >
          <p>
            <label>
              Owner{' '}
              <input
                type="text"
                value={owner}
                autocapitalize="off"
                spellcheck={false}
                onInput={(event) => setOwner(event.currentTarget.value)}
              />
            </label>
          </p>
          <p>
            <label>
              Repo{' '}
              <input
                type="text"
                value={repo}
                placeholder="smart-scale-data"
                autocapitalize="off"
                spellcheck={false}
                onInput={(event) => setRepo(event.currentTarget.value)}
              />
            </label>
          </p>
          <p>
            <label>
              Branch{' '}
              <input
                type="text"
                value={branch}
                placeholder="the repo's default branch"
                autocapitalize="off"
                spellcheck={false}
                onInput={(event) => setBranch(event.currentTarget.value)}
              />
            </label>
          </p>
          <p>
            <label>
              Folder{' '}
              <input
                type="text"
                value={pathPrefix}
                placeholder="the top of the repo"
                autocapitalize="off"
                spellcheck={false}
                onInput={(event) => setPathPrefix(event.currentTarget.value)}
              />
            </label>
          </p>
          <p data-testid="auto-export-token">
            {askToken ? (
              <label>
                Token{' '}
                <input
                  type="password"
                  value={token}
                  placeholder="github_pat_…"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck={false}
                  onInput={(event) => setToken(event.currentTarget.value)}
                />
                {replacing && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplacing(false);
                      setToken('');
                    }}
                  >
                    Keep the old one
                  </button>
                )}
              </label>
            ) : (
              <>
                Token: set{' '}
                <button type="button" disabled={busy} onClick={() => setReplacing(true)}>
                  Replace
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save({ ...draft(), token: null }, 'Token removed.')}
                >
                  Remove
                </button>
              </>
            )}
          </p>
          <p>
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" disabled={busy} onClick={() => void test()}>
              Test
            </button>
          </p>
        </form>
      </details>
      {/* Outside the settings, which fold away after the first save. */}
      {message && (
        <p
          class={message.warn ? 'box warn' : 'box'}
          role="status"
          data-testid="auto-export-message"
        >
          {message.text}
        </p>
      )}
    </section>
  );
}

function errorText(error: unknown): string {
  if (error instanceof SettingsError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
