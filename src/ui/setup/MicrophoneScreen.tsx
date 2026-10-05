// The microphone (T2.9; board Setup-Microphone; spec v2 "Microphone"): listening for the pump and
// the grinder, and their calibration. The detector comes with T3.1, so until then the switch
// is off and can't be turned on, and the shot starts with the Start tap (D-048). The probe
// records the microphone's sound levels meanwhile (T1.24), from which T3.1 will learn.

import type { AppServices } from '../../app/startup';
import { probeHash, setupHash, type Route } from '../route';
import { SetupPage } from './parts';

export function MicrophoneScreen({ services, route }: { services: AppServices; route: Route }) {
  const settings = services.brew.preferences.value;
  const rows = [
    { name: 'Grinder', device: settings.grinder?.model ?? null },
    { name: 'Pump', device: settings.machine?.name ?? null },
  ];
  return (
    <SetupPage
      title="Microphone"
      back={{ href: setupHash({ section: 'list' }, route.mock), label: 'Setup' }}
      mock={route.mock}
      services={services}
      testId="setup-microphone-screen"
    >
      <div class="card">
        <div class="row" style={{ minHeight: '60px', padding: '10px 14px' }}>
          <span style={{ fontWeight: 600 }}>Listen for the pump and the grinder</span>
          <button
            type="button"
            class="toggle"
            aria-pressed="false"
            aria-label="Listen for the pump and the grinder"
            disabled
          />
        </div>
        <p class="muted setup-note setup-pad-bottom">
          Not ready yet: tap Start as the pump starts. Phases still follow the containers.
        </p>
      </div>

      <section class="setup-section" aria-labelledby="m-cal">
        <h2 class="lbl setup-label setup-label-inset" id="m-cal">
          Calibration
        </h2>
        <div class="card">
          {rows.map((row) => (
            <div key={row.name} class="row" style={{ minHeight: '60px', padding: '10px 14px' }}>
              <span class="setup-row-text">
                <span>
                  <span style={{ fontWeight: 600 }}>{row.name}</span>
                  {row.device !== null && <span class="muted"> ({row.device})</span>}
                </span>
                <span class="muted setup-small">Not recorded</span>
              </span>
              <button type="button" class="btn2" disabled style={{ flex: '0 0 auto' }}>
                Record
              </button>
            </div>
          ))}
        </div>
      </section>

      <p class="muted setup-note setup-label-inset">
        Recorded as sound levels only; no audio is kept. Until the detector is ready, the probe's
        Record sound collects them with each recording (
        <a class="link" href={probeHash(route.mock)}>
          Probe
        </a>
        ).
      </p>
    </SetupPage>
  );
}
