// Mockup shot curves v2. Plot box 0..1000 x 0..500 (y down). Weight 0..40 g, flow 0..3 g/s.
function shot({ fd, po, yieldG, peak, tau = 1.6 }) {
  const dt = 0.05;
  const shape = (t) => {
    if (t < fd) return 0;
    if (t <= po) return peak * (1 - Math.exp(-(t - fd) / 1.3)) * (1 - 0.18 * ((t - fd) / (po - fd)));
    return shape(po) * Math.exp(-(t - po) / tau);
  };
  let total = 0;
  for (let t = 0; t < 80; t += dt) total += shape(t) * dt;
  const k = yieldG / total;
  const pts = [];
  let w = 0;
  for (let i = 0; i <= 1200; i++) {
    const t = i * dt;
    const f = shape(t) * k;
    pts.push({ t, w, f });
    w += f * dt;
  }
  return { pts, fd, po };
}
const A = shot({ fd: 7.4, po: 32.0, yieldG: 35.4, peak: 1.7 });
const B = shot({ fd: 5.2, po: 27.0, yieldG: 35.8, peak: 2.1 });
const compact = (pts) => {
  const keep = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !(pts[i - 1][1] === p[1] && pts[i + 1][1] === p[1]));
  return 'M' + keep.map((p) => p.join(' ')).join('L');
};
// window: [t0, t0+40], offset = time subtracted (alignment), tEnd = cut
function path(s, key, { t0, off = 0, tEnd = Infinity }) {
  const max = key === 'w' ? 40 : 3;
  const out = [];
  let last = -1;
  for (const p of s.pts) {
    const r = p.t - off;
    if (r < t0 - 1e-9 || r > t0 + 40 + 1e-9 || p.t > tEnd + 1e-9) continue;
    if (last >= 0 && p.t - last < 0.5 - 1e-9 && p.t < tEnd - 1e-9) continue;
    last = p.t;
    out.push([Math.round(((r - t0) / 40) * 1000), Math.round(500 - (p[key] / max) * 500)]);
  }
  return compact(out);
}
const at = (s, tt) => s.pts.reduce((a, p) => (Math.abs(p.t - tt) < Math.abs(a.t - tt) ? p : a));
const tw = (s, w) => s.pts.find((p) => p.w >= w);
const res = {};
res.single = { wA: path(A, 'w', { t0: 0 }), fA: path(A, 'f', { t0: 0 }) };
const live = tw(A, 27.8);
res.live = { t: +live.t.toFixed(1), f: +live.f.toFixed(2), wA: path(A, 'w', { t0: 0, tEnd: live.t }), fA: path(A, 'f', { t0: 0, tEnd: live.t }), x: Math.round((live.t / 40) * 1000) };
const over = tw(A, 35.0);
res.over = { t: +over.t.toFixed(1), f: +over.f.toFixed(2), wA: path(A, 'w', { t0: 0, tEnd: over.t }), fA: path(A, 'f', { t0: 0, tEnd: over.t }), x: Math.round((over.t / 40) * 1000) };
res.pumpOn = { wA: path(A, 'w', { t0: -1 }), wB: path(B, 'w', { t0: -1 }), fA: path(A, 'f', { t0: -1 }), fB: path(B, 'f', { t0: -1 }), zeroX: 25 };
res.firstDrip = { wA: path(A, 'w', { t0: -8, off: A.fd }), wB: path(B, 'w', { t0: -8, off: B.fd }), fA: path(A, 'f', { t0: -8, off: A.fd }), fB: path(B, 'f', { t0: -8, off: B.fd }), zeroX: 200 };
console.error('A w(po)', at(A, 32).w.toFixed(2), 'final', at(A, 59).w.toFixed(2), 'avg flow', (at(A, 32).w / 24.6).toFixed(2));
console.error('B w(po)', at(B, 27).w.toFixed(2), 'avg flow', (at(B, 27).w / 21.8).toFixed(2));
console.error('live', res.live.t, res.live.f, res.live.x, 'over', res.over.t, res.over.f, res.over.x);
console.log(JSON.stringify(res, null, 1));
