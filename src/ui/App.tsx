import { BUILD_INFO } from '../platform/build-info';
import { detectCapabilities } from '../platform/capabilities';

// Placeholder home page (T0.2). Until the probe screen exists (T1.8), its job is to show which
// browser APIs the runtime exposes. Open it on the phone and screenshot the table (hardware
// test B1).
export function App() {
  const capabilities = detectCapabilities(globalThis);

  return (
    <main>
      <h1>Espresso tracker</h1>
      <p>No scale features yet. This page shows what this browser supports.</p>

      <table>
        <thead>
          <tr>
            <th>Capability</th>
            <th>Available</th>
            <th>Used for</th>
          </tr>
        </thead>
        <tbody>
          {capabilities.map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td class={c.available ? 'yes' : 'no'}>{c.available ? 'yes' : 'no'}</td>
              <td>{c.usedFor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p class="muted">
        Build {BUILD_INFO.commit} · {BUILD_INFO.buildTime}
      </p>
      <p class="muted">{navigator.userAgent}</p>
    </main>
  );
}
