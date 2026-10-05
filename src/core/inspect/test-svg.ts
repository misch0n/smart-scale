/** Test support only: checks on the inspection charts' SVG. */

/**
 * Whether every element closes, in order, and every `&` starts an entity. Attribute values and
 * text are escaped, so a tag is `<…>` with no `<` or `>` inside.
 */
export function wellFormed(xml: string): boolean {
  const open: string[] = [];
  for (const [, closing, name, selfClosing] of xml.matchAll(
    /<(\/?)([A-Za-z][\w:-]*)(?:\s[^<>]*?)?(\/?)>/g,
  )) {
    if (selfClosing) continue;
    if (closing) {
      if (open.pop() !== name) return false;
    } else {
      open.push(name);
    }
  }
  return open.length === 0 && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml);
}
