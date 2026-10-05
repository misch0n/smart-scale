// Renders an artboard in headless Chromium with a small stand-in for the canvas runtime:
// `{{holes}}` (dotted lookups), `<sc-for>` and `<sc-if>`, filled from `renderVals()`. Good
// enough to measure a board's natural height and to look at its layout; the published canvas
// stays the reference (fonts differ: the container has no SF or IBM Plex).
//
//   node render-dc.mjs <board.dc.html> ['{"mode":"dark"}'] [out.png]
//
// Prints the declared height (the root's `height`) and the natural height (the root with
// `height: auto`, so spacers collapse). Uses the agent environment's Playwright
// (scripts/playwright.mjs).

import fs from 'node:fs';
import { chromiumPath, findPlaywright } from '../../../scripts/playwright.mjs';

const [file, propsJson = '{}', out] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const js = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
class DCLogic {
  constructor(props) {
    this.props = props;
    this.state = null;
  }
  setState(patch) {
    this.state = { ...(this.state || {}), ...patch };
  }
}
const Component = new Function('DCLogic', js + '\nreturn Component;')(DCLogic);
// Handlers drop out in the JSON round trip; the page only needs the values.
const data = JSON.parse(JSON.stringify(new Component(JSON.parse(propsJson)).renderVals()));
const xdc = src.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1];
const helmet = (xdc.match(/<helmet>([\s\S]*?)<\/helmet>/) || [null, ''])[1].replace(/<link[^>]*>/g, '');
const body = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');

const playwright = findPlaywright();
if (!playwright) throw new Error('Playwright not found (scripts/playwright.mjs)');
const browser = await playwright.chromium.launch({ executablePath: chromiumPath() });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${helmet}</head><body>${body}</body></html>`);
  const sizes = await page.evaluate((data) => {
    const strip = (s) => s.trim().replace(/^\{\{|\}\}$/g, '').trim();
    const lookup = (scope, expr) => {
      if (expr === 'true') return true;
      if (expr === 'false') return false;
      if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
      return expr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
    };
    const fill = (text, scope) =>
      text.replace(/\{\{([^}]+)\}\}/g, (_, e) => {
        const v = lookup(scope, e.trim());
        return v == null ? '' : String(v);
      });
    // Returns the nodes that take this node's place.
    const expand = (node, scope) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.includes('{{')) node.textContent = fill(node.textContent, scope);
        return [node];
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return [node];
      if (node.localName === 'sc-for') {
        const list = lookup(scope, strip(node.getAttribute('list'))) || [];
        const as = node.getAttribute('as');
        return list.flatMap((item, i) =>
          Array.from(node.childNodes).flatMap((child) =>
            expand(child.cloneNode(true), { ...scope, [as]: item, $index: i }),
          ),
        );
      }
      if (node.localName === 'sc-if') {
        if (!lookup(scope, strip(node.getAttribute('value')))) return [];
        return Array.from(node.childNodes).flatMap((child) => expand(child, scope));
      }
      for (const attr of Array.from(node.attributes)) {
        if (attr.name.startsWith('hint-')) node.removeAttribute(attr.name);
        else if (attr.value.includes('{{')) node.setAttribute(attr.name, fill(attr.value, scope));
      }
      for (const child of Array.from(node.childNodes)) {
        const replacement = expand(child, scope);
        if (replacement.length === 1 && replacement[0] === child) continue;
        for (const r of replacement) node.insertBefore(r, child);
        child.remove();
      }
      return [node];
    };
    for (const child of Array.from(document.body.childNodes)) {
      const replacement = expand(child, data);
      for (const r of replacement) if (r !== child) document.body.insertBefore(r, child);
      if (!replacement.includes(child)) child.remove();
    }
    const root = document.querySelector('.ss') ?? document.body.firstElementChild;
    const declared = root.getBoundingClientRect().height;
    const saved = root.style.height;
    root.style.height = 'auto';
    for (const el of root.children) if (el.style.height === '100%') el.dataset.h = '1';
    for (const el of root.querySelectorAll('[data-h]')) el.style.height = 'auto';
    const natural = Math.ceil(root.getBoundingClientRect().height);
    for (const el of root.querySelectorAll('[data-h]')) el.style.height = '100%';
    root.style.height = saved;
    return { declared, natural };
  }, data);
  console.log(`${file}: declared ${sizes.declared}px, natural ${sizes.natural}px`);
  if (out) {
    await page.setViewportSize({ width: 390, height: Math.max(sizes.declared, 200) });
    await page.locator('.ss').first().screenshot({ path: out });
  }
} finally {
  await browser.close();
}
