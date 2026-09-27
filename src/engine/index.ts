/**
 * Selector Grabber locator engine.
 *
 * For a clicked element it climbs a ladder of strategies, most stable first, and returns the
 * first relative XPath that matches exactly that one element on the live page:
 *
 *   1  test attribute        //button[@data-testid='login-submit']        Strong
 *   2  stable id             //table[@id='pokedex']                        Strong
 *   3  name (form fields)    //input[@name='email']                        Strong
 *   4  label / aria / alt    //input[@placeholder='Search']                Strong
 *   5  exact visible text    //a[normalize-space()='Charmander']           OK
 *   6  link path             //a[@href='/pokedex/bulbasaur']               OK
 *   7  combined or anchored  //table[@id='pokedex']//tr[.//a[normalize-space()='Bulbasaur']]/td[5]   OK
 *   8  anchor + position     (//table[@id='pokedex']//tr)[3]               Fragile
 *
 * It never emits an absolute path such as /html/body/div[3]/...
 * The module has no Chrome APIs, so it runs (and is tested) anywhere a DOM exists.
 */
import { describe, tagStep, truncate, normalizedText, xpathNormalizedText } from './describe';
import { looksGenerated } from './generated';
import { xpathLiteral as lit } from './literal';
import { isUniqueMatch, positionIn } from './validate';

export { xpathLiteral } from './literal';
export { isUniqueMatch } from './validate';
export { looksGenerated } from './generated';

export type Stability = 'Strong' | 'OK' | 'Fragile';

export interface LocatorResult {
  xpath: string;
  rung: number;
  strategy: string;
  stability: Stability;
  /** Short label for the panel, e.g. `link "Bulbasaur"`. */
  description: string;
  tag: string;
  /** First 60 characters of the element's visible text (or input value / placeholder). */
  text: string;
}

interface Pred {
  pred: string;
  rung: number;
  strategy: string;
}

const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy'];
const LABEL_ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
const NAME_TAGS = new Set(['input', 'select', 'textarea', 'button', 'form', 'iframe', 'fieldset', 'output', 'object']);
const FORM_FIELDS = new Set(['input', 'select', 'textarea']);
const MAX_TEXT = 40;
/** Elements whose text is their identity. A layout box's text is just its children's text. */
const PREFIX_TAGS = new Set(['a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'label', 'legend', 'caption', 'summary', 'option', 'dt', 'dd', 'span', 'strong', 'em', 'b', 'small', 'blockquote', 'figcaption']);
const MAX_ATTR = 80;

function stabilityFor(rung: number): Stability {
  if (rung <= 4) return 'Strong';
  if (rung <= 7) return 'OK';
  return 'Fragile';
}

/** The element's first direct text node, squeezed like normalize-space(text()). */
function ownText(el: Element): string {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && n.textContent!.trim()) return n.textContent!.replace(/[ \t\r\n]+/g, ' ').trim();
  }
  return '';
}

/**
 * The opening words of a long text, cut at a word boundary: at most MAX_TEXT characters and at
 * least 16, so the prefix is still specific. Null for short text (matched whole instead), for
 * text too long to be a label (a whole article), and for text containing &nbsp;.
 */
export function textPrefix(t: string): string | null {
  if (t.length <= MAX_TEXT || t.length > 300 || t.includes('\u00a0')) return null;
  let cut = t.slice(0, MAX_TEXT);
  if (t[MAX_TEXT] !== ' ') {
    const space = cut.lastIndexOf(' ');
    if (space < 16) return null;
    cut = cut.slice(0, space);
  }
  return cut.trimEnd();
}

function usableText(el: Element): string | null {
  const t = xpathNormalizedText(el);
  if (!t || t.length > MAX_TEXT || t.includes('\u00a0')) return null;
  return t;
}

/** Predicates that describe the element by itself, in ladder order. */
export function ownPredicates(el: Element): Pred[] {
  const preds: Pred[] = [];
  const tag = el.localName.toLowerCase();

  for (const attr of TEST_ATTRS) {
    const v = el.getAttribute(attr);
    if (v && v.trim() && v.length <= MAX_ATTR) preds.push({ pred: `@${attr}=${lit(v)}`, rung: 1, strategy: `test attribute (${attr})` });
  }

  const id = el.getAttribute('id');
  if (id && !looksGenerated(id)) preds.push({ pred: `@id=${lit(id)}`, rung: 2, strategy: 'id' });

  const name = el.getAttribute('name');
  if (name && NAME_TAGS.has(tag) && !looksGenerated(name)) preds.push({ pred: `@name=${lit(name)}`, rung: 3, strategy: 'name' });

  for (const attr of LABEL_ATTRS) {
    const v = el.getAttribute(attr);
    if (v && v.trim() && v.length <= MAX_ATTR) preds.push({ pred: `@${attr}=${lit(v)}`, rung: 4, strategy: attr });
  }

  if (FORM_FIELDS.has(tag)) {
    // <label for="x">Email</label> ... <input id="x">: works even when the id itself is generated.
    if (id) {
      const label = el.ownerDocument.querySelector(`label[for="${cssEscape(id)}"]`);
      const t = label && usableText(label);
      if (t) preds.push({ pred: `@id=//label[normalize-space()=${lit(t)}]/@for`, rung: 4, strategy: 'label text' });
    }
    // <label>Remember me <input type="checkbox"></label>
    const wrapping = el.closest('label');
    const t = wrapping && usableText(wrapping);
    if (t) preds.push({ pred: `ancestor::label[normalize-space()=${lit(t)}]`, rung: 4, strategy: 'wrapping label' });
  }

  if (tag !== 'html' && tag !== 'body') {
    const t = usableText(el);
    if (t) {
      preds.push({ pred: `normalize-space()=${lit(t)}`, rung: 5, strategy: 'visible text' });
      // A wrapper whose only text comes from this element has the same normalize-space() value.
      // text() looks only at the element's own text node, which tells the two apart.
      const own = ownText(el);
      if (own === t) preds.push({ pred: `normalize-space(text())=${lit(t)}`, rung: 5, strategy: 'own text' });
    } else {
      // Long text (a search-result title, a headline): match its opening words instead of
      // giving up and falling back to position.
      const prefix = PREFIX_TAGS.has(tag) ? textPrefix(xpathNormalizedText(el)) : null;
      if (prefix) preds.push({ pred: `starts-with(normalize-space(),${lit(prefix)})`, rung: 5, strategy: 'text prefix' });
    }
  }

  if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('javascript:') && !href.includes('?') && href.length <= 120) {
      preds.push({ pred: `@href=${lit(href)}`, rung: 6, strategy: 'link path' });
    }
  }
  return preds;
}

interface Anchor {
  el: Element;
  xpath: string;
}

/** Ancestors that can be located on their own with a Strong predicate, nearest first. */
function findAnchors(el: Element, limit = 4): Anchor[] {
  const anchors: Anchor[] = [];
  for (let a = el.parentElement; a && anchors.length < limit; a = a.parentElement) {
    const t = a.localName.toLowerCase();
    if (t === 'body' || t === 'html') break;
    for (const p of ownPredicates(a)) {
      if (p.rung > 4 && p.rung !== 6) continue; // Strong predicates, or a link's own URL
      const xp = `//${tagStep(a)}[${p.pred}]`;
      if (isUniqueMatch(xp, a)) {
        anchors.push({ el: a, xpath: xp });
        break;
      }
    }
  }
  return anchors;
}

/** How far up the tree to look for a labelled container. */
const MAX_CONTEXT_LEVELS = 6;
/** Longest child path the engine will write, from a container down to the element or to its key. */
const MAX_STEPS = 3;

/**
 * Child steps from `from` down to `to`, e.g. `td[5]` or `td/a`. Positions ([n]) are added only
 * where same-tag siblings exist, and only when asked. Returns null when `to` is more than
 * MAX_STEPS levels down: a longer chain is an absolute path in disguise.
 */
function childPath(from: Element, to: Element, withPositions: boolean): string | null {
  const chain: Element[] = [];
  for (let n: Element | null = to; n && n !== from; n = n.parentElement) {
    chain.unshift(n);
    if (chain.length > MAX_STEPS) return null;
  }
  if (chain.length === 0 || chain[0].parentElement !== from) return null;
  return chain
    .map((node) => {
      const step = tagStep(node);
      if (!withPositions) return step;
      const same = Array.from(node.parentElement!.children).filter((c) => c.localName === node.localName);
      return same.length > 1 ? `${step}[${same.indexOf(node) + 1}]` : step;
    })
    .join('/');
}

/** Label-like keys first: a nearby label or heading names a container better than any other text. */
function keyRank(k: Element): number {
  const t = k.localName.toLowerCase();
  if (t === 'label' || t === 'legend' || t === 'th' || t === 'dt' || /^h[1-6]$/.test(t)) return 0;
  if (t === 'a') return 1;
  if (t === 'strong' || t === 'b' || t === 'span' || t === 'small') return 2;
  return 3;
}

/**
 * Context strategy: find the nearest container that holds a short, unique piece of text near the
 * element (a table row with its name link, a card with its title, a form group with its label),
 * then find the element inside that container. This is how people write locators by hand:
 *   //table[@id='pokedex']//tr[td/a[normalize-space()='Bulbasaur']]/td[5]
 *   //div[h3[normalize-space()='Red mug']]//button[normalize-space()='Add to cart']
 * The container is at most MAX_CONTEXT_LEVELS up, and every child path is at most MAX_STEPS long.
 */
function contextStrategy(el: Element, preds: Pred[], prefix: string, stopAt: Element | null): string | null {
  const tag = tagStep(el);
  let c = el.parentElement;
  for (let level = 0; c && c !== stopAt && level < MAX_CONTEXT_LEVELS; level++, c = c.parentElement) {
    const t = c.localName.toLowerCase();
    if (t === 'body' || t === 'html') break;

    const keys = Array.from(c.querySelectorAll('*'))
      .filter((k) => k !== el && !k.contains(el) && !el.contains(k))
      .map((k) => ({ k, text: usableText(k), path: childPath(c!, k, false) }))
      .filter((x): x is { k: Element; text: string; path: string } => !!x.text && !!x.path)
      .sort((a, b) => keyRank(a.k) - keyRank(b.k) || a.path.split('/').length - b.path.split('/').length)
      .slice(0, 30);

    for (const { text, path } of keys) {
      const container = `${prefix}//${tagStep(c)}[${path}[normalize-space()=${lit(text)}]]`;
      if (!isUniqueMatch(container, c)) continue;
      for (const p of preds) {
        const xp = `${container}//${tag}[${p.pred}]`;
        if (isUniqueMatch(xp, el)) return xp;
      }
      const rel = childPath(c, el, true);
      if (rel && isUniqueMatch(`${container}/${rel}`, el)) return `${container}/${rel}`;
      if (isUniqueMatch(`${container}//${tag}`, el)) return `${container}//${tag}`;
    }
  }
  return null;
}

function result(el: Element, xpath: string, rung: number, strategy: string): LocatorResult {
  const tag = el.localName.toLowerCase();
  const raw =
    FORM_FIELDS.has(tag)
      ? (el as HTMLInputElement).value || el.getAttribute('placeholder') || ''
      : normalizedText(el);
  return {
    xpath,
    rung,
    strategy,
    stability: stabilityFor(rung),
    description: describe(el),
    tag,
    text: truncate(raw, 60),
  };
}

/** Main entry point: the most stable unique relative XPath for `el`. */
export function generateLocator(el: Element): LocatorResult {
  const tag = tagStep(el);
  const lower = el.localName.toLowerCase();
  if (lower === 'html' || lower === 'body') return result(el, `//${lower}`, 2, 'document root');

  const preds = ownPredicates(el);

  // Rungs 1-6: one predicate on the element itself.
  for (const p of preds) {
    const xp = `//${tag}[${p.pred}]`;
    if (isUniqueMatch(xp, el)) return result(el, xp, p.rung, p.strategy);
  }

  // Rung 7a: two of the element's own predicates together.
  for (let i = 0; i < preds.length; i++) {
    for (let j = i + 1; j < preds.length; j++) {
      const xp = `//${tag}[${preds[i].pred}][${preds[j].pred}]`;
      if (isUniqueMatch(xp, el)) return result(el, xp, 7, `${preds[i].strategy} + ${preds[j].strategy}`);
    }
  }

  // Rung 7b: inside the nearest uniquely-locatable ancestor.
  const anchors = findAnchors(el);
  for (const a of anchors) {
    for (const p of preds) {
      const xp = `${a.xpath}//${tag}[${p.pred}]`;
      if (isUniqueMatch(xp, el)) return result(el, xp, 7, `anchored ${p.strategy}`);
    }
    const bare = `${a.xpath}//${tag}`;
    if (isUniqueMatch(bare, el)) return result(el, bare, 7, 'anchored tag');
  }

  // Rung 7c: inside the nearest container identified by nearby text (row, card, form group).
  for (const a of anchors) {
    const xp = contextStrategy(el, preds, a.xpath, a.el);
    if (xp) return result(el, xp, 7, 'anchored context');
  }
  const ctx = contextStrategy(el, preds, '', null);
  if (ctx) return result(el, ctx, 7, 'context');

  // Rung 8: position among same-tag elements under the nearest anchor. Always unique, but fragile.
  const base = `${anchors[0]?.xpath ?? ''}//${tag}`;
  const n = positionIn(base, el);
  const xp = `(${base})[${n}]`;
  return result(el, xp, 8, anchors[0] ? 'anchored position' : 'position');
}

/** Minimal CSS.escape for attribute selectors (jsdom lacks CSS.escape in some versions). */
function cssEscape(s: string): string {
  return s.replace(/["\\]/g, '\\$&');
}
