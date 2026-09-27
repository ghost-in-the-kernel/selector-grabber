/**
 * Turns any string into a valid XPath 1.0 string literal.
 *
 * XPath 1.0 has no escape character, so:
 *   - no apostrophe      -> wrap in single quotes:  'Bulbasaur'
 *   - apostrophe only    -> wrap in double quotes:  "It's"
 *   - both quote types   -> build it with concat(): concat('It', "'", 's "new"')
 */
export function xpathLiteral(s: string): string {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return `concat('${s.split("'").join(`', "'", '`)}')`;
}
