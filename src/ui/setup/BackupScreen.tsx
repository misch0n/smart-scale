// Automatic export's settings and status (T1.20, D-027), moved from the probe to Setup (T2.9):
// the backup reminder (D-031) opens them here. The panel keeps its plain look until T3.5.

import type { AppServices } from '../../app/startup';
import { AutoExportPanel } from '../AutoExportPanel';
import { setupHash, type Route } from '../route';
import { TabBar } from '../TabBar';

export function BackupScreen({ services, route }: { services: AppServices; route: Route }) {
  return (
    <>
      <main class="probe" data-testid="setup-backup-screen">
        <a class="back" href={setupHash({ section: 'list' }, route.mock)}>
          ‹ Setup
        </a>
        <AutoExportPanel autoExport={services.autoExport} heading="h1" />
      </main>
      <TabBar current="setup" mock={route.mock} />
    </>
  );
}
