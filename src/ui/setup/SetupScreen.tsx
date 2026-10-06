// Setup (T2.9; board Setup; spec v2 "Equipment, coffee and settings"): what needs attention (the
// maintenance due or coming up, T2.10, and the containers' clashes), a row for each kind of
// setting with what it holds, the data export, the automatic export and the probe (D-072: the
// probe, the Setup tab until now, is a row here). Each row opens its board's screen; this file
// picks the screen the route names.

import { useEffect, useState } from 'preact/hooks';
import { EXPORT_MEDIA_TYPE, exportAll } from '../../app/export';
import type { AppServices } from '../../app/startup';
import { maintenanceItems, maintenanceReminders, openClashes } from '../../core/model';
import { BUILD_INFO } from '../../platform/build-info';
import { canShareFile, shareFile } from '../../platform/share';
import { describeAutoExport } from '../auto-export-text';
import { DownloadIcon } from '../icons';
import { probeHash, setupHash, type Route } from '../route';
import { useLiveUpdates } from '../use-live-updates';
import { BackupScreen } from './BackupScreen';
import { ContainersScreen } from './ContainersScreen';
import {
  containersSummary,
  grindersSummary,
  machineSummary,
  maintenanceSummary,
  packsSummary,
  recipesSummary,
  tagsSummary,
  todayDate,
} from './format';
import { GrindersScreen } from './GrindersScreen';
import { MachineScreen } from './MachineScreen';
import { MaintenanceRow } from './MaintenanceBlock';
import { MicrophoneScreen } from './MicrophoneScreen';
import { PackScreen } from './PackScreen';
import { PacksScreen } from './PacksScreen';
import { LinkRow, SetupPage, useSetupUpdates } from './parts';
import { RecipesScreen } from './RecipesScreen';
import { TagsScreen } from './TagsScreen';

export function SetupScreen({ services, route }: { services: AppServices; route: Route }) {
  const view = route.setup ?? { section: 'list' };
  switch (view.section) {
    case 'list':
      return <SetupList services={services} route={route} />;
    case 'machine':
      return <MachineScreen services={services} route={route} />;
    case 'grinders':
      return <GrindersScreen services={services} route={route} />;
    case 'recipes':
      return <RecipesScreen services={services} route={route} />;
    case 'packs':
      return <PacksScreen services={services} route={route} />;
    case 'pack':
      return <PackScreen services={services} route={route} packId={view.packId} />;
    case 'containers':
      return <ContainersScreen services={services} route={route} />;
    case 'tags':
      return <TagsScreen services={services} route={route} />;
    case 'microphone':
      return <MicrophoneScreen services={services} route={route} />;
    case 'backup':
      return <BackupScreen services={services} route={route} />;
  }
}

function SetupList({ services, route }: { services: AppServices; route: Route }) {
  useSetupUpdates(services);
  useLiveUpdates((notify) => services.autoExport.onChange(notify), [services]);
  const { entities, brew } = services;
  const settings = brew.preferences.value;
  const mock = route.mock;
  const today = todayDate();
  const containers = entities.value.containers;
  const clashes = openClashes(containers);
  const containerRow = containersSummary(containers);
  const autoExport = services.autoExport;
  const maintenance = maintenanceItems(entities.value.machines, entities.value.grinders, today);
  const reminders = maintenanceReminders(maintenance, { soon: true });
  const maintenanceRow = maintenanceSummary(maintenance);

  return (
    <SetupPage title="Setup" back={null} mock={mock} services={services} testId="setup">
      {(reminders.length > 0 || clashes.length > 0) && (
        <section class="setup-section" aria-labelledby="s-alerts">
          <h2 class="lbl setup-label setup-label-inset" id="s-alerts">
            Needs attention
          </h2>
          <div class="card">
            {reminders.map((item) => (
              <MaintenanceRow key={`${item.owner.id}-${item.kind}`} item={item} named mock={mock} />
            ))}
            {clashes.length > 0 && (
              <a
                class="row"
                href={setupHash({ section: 'containers' }, mock)}
                data-testid="attention"
              >
                <span>
                  Containers{' '}
                  <span class="muted">
                    ·{' '}
                    {clashes.length === 1
                      ? `${clashes[0].a.name} and ${clashes[0].b.name}`
                      : `${clashes.length} pairs`}
                  </span>
                </span>
                <span class="setup-row-end">
                  {clashes.some((clash) => clash.kind === 'same') ? (
                    <span class="badge warn">Same weight</span>
                  ) : (
                    <span class="badge caution">
                      {clashes.length} {clashes.length === 1 ? 'warning' : 'warnings'}
                    </span>
                  )}
                  <span class="chev" aria-hidden="true">
                    ›
                  </span>
                </span>
              </a>
            )}
          </div>
        </section>
      )}

      <nav class="card" aria-label="Settings">
        <LinkRow
          href={setupHash({ section: 'machine' }, mock)}
          title="Machine"
          detail={machineSummary(settings.machine)}
          testId="setup-machine"
        />
        <LinkRow
          href={setupHash({ section: 'grinders' }, mock)}
          title="Grinders"
          detail={grindersSummary(settings.grinder)}
          testId="setup-grinders"
        />
        <LinkRow
          href={setupHash({ section: 'recipes' }, mock)}
          title="Recipes"
          detail={recipesSummary(settings.recipes, settings.recipe)}
          testId="setup-recipes"
        />
        <LinkRow
          href={setupHash({ section: 'packs' }, mock)}
          title="Coffee packs"
          detail={packsSummary(entities.value.packs, settings.pack, today)}
          testId="setup-packs"
        />
        <LinkRow
          href={setupHash({ section: 'containers' }, mock)}
          title="Containers"
          detail={
            <>
              {containerRow.count}
              {containerRow.warnings !== null && (
                <>
                  {' · '}
                  <span class="c-caution">{containerRow.warnings}</span>
                </>
              )}
            </>
          }
          testId="setup-containers"
        />
        <LinkRow
          href={setupHash({ section: 'tags' }, mock)}
          title="Tags"
          detail={tagsSummary(entities.value.tags)}
          testId="setup-tags"
        />
        <LinkRow
          href={setupHash({ section: 'machine' }, mock)}
          title="Maintenance"
          detail={
            maintenanceRow.tone === null ? (
              maintenanceRow.text
            ) : (
              <span class={`c-${maintenanceRow.tone}`}>{maintenanceRow.text}</span>
            )
          }
          testId="setup-maintenance"
        />
        <LinkRow
          href={setupHash({ section: 'microphone' }, mock)}
          title="Microphone"
          detail="Off · not ready yet"
          testId="setup-microphone"
        />
      </nav>

      <DataCard services={services} />

      <nav class="card" aria-label="Backup and diagnostics">
        <LinkRow
          href={setupHash({ section: 'backup' }, mock)}
          title="Automatic export"
          detail={describeAutoExport(autoExport.status, autoExport.settings, (epochMs) =>
            new Date(epochMs).toLocaleString(),
          )}
          testId="setup-backup"
        />
        <LinkRow
          href={probeHash(mock)}
          title="Probe"
          detail="The scale's connection, raw data and recordings"
          testId="setup-probe"
        />
      </nav>
    </SetupPage>
  );
}

/**
 * Export all (board Setup's Data card): every recording, shot, entity and setting in one file
 * (D-025, D-075). Two taps, as on the probe: the first builds the file, the second downloads it
 * or opens the share sheet, which needs a tap of its own.
 */
function DataCard({ services }: { services: AppServices }) {
  const [file, setFile] = useState<{ readonly file: File; readonly url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => (file ? () => URL.revokeObjectURL(file.url) : undefined), [file]);

  async function prepare(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await services.links.flush().catch(() => {
        // Export what is stored: some file beats none.
      });
      const exported = await exportAll(services.storage, { app: BUILD_INFO });
      const made = new File([exported.text], exported.fileName, { type: EXPORT_MEDIA_TYPE });
      setFile({ file: made, url: URL.createObjectURL(made) });
    } catch (error) {
      setMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card setup-data">
      <div class="setup-data-head">
        <span class="lbl">Data</span>
        <button
          type="button"
          class="btn2"
          disabled={busy}
          onClick={() => void prepare()}
          data-testid="export-all"
        >
          <DownloadIcon size={18} />
          {busy ? 'Preparing…' : 'Export all (JSON)'}
        </button>
      </div>
      {file !== null && (
        <div class="setup-data-ready" data-testid="export-all-ready">
          <span class="muted">{file.file.name}</span>
          <span class="setup-data-actions">
            <a class="btn2" href={file.url} download={file.file.name}>
              Download
            </a>
            {canShareFile(navigator, file.file) && (
              <button
                type="button"
                class="btn2"
                onClick={() => {
                  shareFile(navigator, file.file).then(
                    (outcome) =>
                      setMessage(outcome === 'shared' ? 'Shared.' : 'Sharing cancelled.'),
                    (error: unknown) => setMessage(`Sharing failed: ${String(error)}`),
                  );
                }}
              >
                Share
              </button>
            )}
          </span>
        </div>
      )}
      {message !== null && <p class="muted setup-data-message">{message}</p>}
    </div>
  );
}
