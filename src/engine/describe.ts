const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * The node-test part of an XPath step for this element.
 * HTML elements use their tag name. SVG and MathML elements live in another namespace,
 * where a bare `svg` or `path` matches nothing in an HTML document, so they use local-name().
 */
export function tagStep(el: Element): string {
  if (el.namespaceURI === XHTML_NS || el.namespaceURI === null) return el.localName.toLowerCase();
  return `*[local-name()='${el.localName}']`;
}

/**
 * Display text for the panel. innerText follows the page layout, so "Owner" and
 * "ghost-in-the-kernel" in separate blocks read as two words, not "Ownerghost-in-the-kernel".
 * Matching always uses xpathNormalizedText(), which is what XPath itself sees.
 */
export function normalizedText(el: Element): string {
  const raw = (el as HTMLElement).innerText ?? el.textContent ?? '';
  return raw.replace(/[\s\u00a0]+/g, ' ').trim();
}

/** XPath normalize-space() only squeezes spaces, tabs, CR and LF (not &nbsp;). */
export function xpathNormalizedText(el: Element): string {
  return (el.textContent ?? '').replace(/[ \t\r\n]+/g, ' ').trim();
}

const ROLE_BY_TAG: Record<string, string> = {
  button: 'button',
  select: 'combobox',
  textarea: 'textbox',
  table: 'table',
  tr: 'row',
  td: 'cell',
  th: 'column header',
  img: 'image',
  nav: 'navigation',
  ul: 'list',
  ol: 'list',
  li: 'list item',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
};

const INPUT_ROLE: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  submit: 'button',
  button: 'button',
  reset: 'button',
  range: 'slider',
  search: 'search box',
};

/** A short human label for the results panel, e.g. `link "Bulbasaur"` or `table#pokedex`. */
export function describe(el: Element): string {
  const tag = el.localName.toLowerCase();
  let kind = el.getAttribute('role') ?? ROLE_BY_TAG[tag];
  if (!kind && tag === 'a' && el.hasAttribute('href')) kind = 'link';
  if (!kind && tag === 'input') kind = INPUT_ROLE[(el.getAttribute('type') ?? 'text').toLowerCase()] ?? 'textbox';

  const isField = tag === 'input' || tag === 'textarea' || tag === 'select';
  const labelText = isField ? normalizedText((el as HTMLInputElement).labels?.[0] ?? el.ownerDocument.createElement('span')) : '';
  const name =
    el.getAttribute('aria-label') ||
    (isField
      ? labelText || el.getAttribute('placeholder') || el.getAttribute('name') || (el as HTMLInputElement).value || ''
      : tag === 'img'
        ? el.getAttribute('alt') ?? ''
        : normalizedText(el));

  const shortName = truncate(name, 40);
  if (shortName) return `${kind ?? tag} "${shortName}"`;
  const id = el.getAttribute('id');
  if (id) return `${tag}#${id}`;
  return kind ?? tag;
}

export function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
