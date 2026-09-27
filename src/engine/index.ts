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
const MAX_ATTR = 80;

function stabilityFor(rung: number): Stability {
  if (rung <= 4) return 'Strong';
  if (rung <= 7) return 'OK';
  return 'Fragile';
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
    if (t) preds.push({ pred: `normalize-space()=${lit(t)}`, rung: 5, strategy: 'visible text' });
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
      if (p.rung > 4) continue;
      const xp = `//${tagStep(a)}[${p.pred}]`;
      if (isUniqueMatch(xp, a)) {
        anchors.push({ el: a, xpath: xp });
        break;
      }
    }
  }
  return anchors;
}

/** Child steps from `from` down to `to`, adding [n] only where same-tag siblings exist. */
function relativeSteps(from: Element, to: Element): string | null {
  const chain: Element[] = [];
  for (let n: Element | null = to; n && n !== from; n = n.parentElement) chain.unshift(n);
  if (chain.length === 0 || chain[0].parentElement !== from) return null;
  return chain
    .map((node) => {
      const parent = node.parentElement!;
      const same = Array.from(parent.children).filter((c) => c.localName === node.localName);
      const step = tagStep(node);
      return same.length > 1 ? `${step}[${same.indexOf(node) + 1}]` : step;
    })
    .join('/');
}

function hasSameTagSiblings(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  let n = 0;
  for (const c of Array.from(parent.children)) if (c.localName === el.localName && ++n > 1) return true;
  return false;
}

/**
 * Repeated-structure strategy: find the repeated container (a table row, a list item, a card)
 * that holds the element, identify that container by a short text inside it (preferring links
 * and headers), then step down to the element by position.
 *   //table[@id='pokedex']//tr[.//a[normalize-space()='Bulbasaur']]/td[5]
 */
function rowStrategy(el: Element, prefix: string, stopAt: Element | null): string | null {
  for (let row: Element | null = el; row && row !== stopAt; row = row.parentElement) {
    const t = row.localName.toLowerCase();
    if (t === 'body' || t === 'html') break;
    if (!hasSameTagSiblings(row)) continue;

    const keys = Array.from(row.querySelectorAll('*'))
      .filter((k) => k !== el && !el.contains(k) && !k.contains(el))
      .filter((k) => k.children.length === 0 || k.localName === 'a')
      .sort((a, b) => keyRank(a) - keyRank(b))
      .slice(0, 40);

    for (const k of keys) {
      const text = usableText(k);
      if (!text) continue;
      const rowXp = `${prefix}//${tagStep(row)}[.//${tagStep(k)}[normalize-space()=${lit(text)}]]`;
      if (!isUniqueMatch(rowXp, row)) continue;
      if (row === el) return rowXp;
      const rel = relativeSteps(row, el);
      if (!rel) continue;
      const xp = `${rowXp}/${rel}`;
      if (isUniqueMatch(xp, el)) return xp;
    }
  }
  return null;
}

function keyRank(k: Element): number {
  const t = k.localName.toLowerCase();
  if (t === 'a') return 0;
  if (t === 'th' || /^h[1-6]$/.test(t)) return 1;
  if (t === 'label' || t === 'strong' || t === 'b') return 2;
  return 3;
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

  // Rung 7c: repeated container identified by its text, then down by position.
  for (const a of anchors) {
    const xp = rowStrategy(el, a.xpath, a.el);
    if (xp) return result(el, xp, 7, 'anchored row');
  }
  const docRow = rowStrategy(el, '', null);
  if (docRow) return result(el, docRow, 7, 'row');

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
