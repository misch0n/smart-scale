import fs from 'node:fs';
const [file, ...propSets] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const js = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
class DCLogic { constructor(props) { this.props = props; this.state = null; } setState(p) { this.state = { ...(this.state || {}), ...p }; } }
const Component = new Function('DCLogic', js + '\nreturn Component;')(DCLogic);
for (const ps of propSets.length ? propSets : ['{}']) {
  const c = new Component(JSON.parse(ps));
  let v = c.renderVals();
  const fns = [];
  const walk = (o, path) => { if (typeof o === 'function') fns.push([path, o]); else if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) walk(x, path + '.' + k); };
  walk(v, '');
  for (const [p, fn] of fns) { try { fn({ clientX: 100 }); c.renderVals(); } catch (e) { console.log('ERR', p, e.message); } }
  v = c.renderVals();
  console.log(ps, 'ok', fns.length, 'handlers', JSON.stringify({ dirMissing: v.dirMissing, canSave: v.canSave, score: v.dial && v.dial.map(d => d.label).join(','), sum: v.sum }).slice(0, 300));
}
