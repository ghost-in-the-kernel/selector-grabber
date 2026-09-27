/**
 * The picker. Injected into the active tab when the toolbar icon is clicked.
 *
 * - Everything it draws lives in a closed shadow root, so page CSS cannot break it and page
 *   scripts cannot read it.
 * - It listens in the capture phase and cancels page clicks while picking, so clicking a link
 *   picks it instead of navigating away.
 * - On Done it hands the picks to the results panel: an extension page shown in an iframe.
 *   The page never sees the results (or, from v0.3, the ad) because that iframe belongs to
 *   the extension's origin.
 *
 * Content scripts keep their globals between injections in the same tab, so clicking the icon
 * again finds the running picker and toggles it off.
 */
import { generateLocator, isUniqueMatch } from '../engine';
import type { Pick } from '../format';
import { PICKER_CSS } from './styles';

interface PickerApi {
  toggle(): void;
}

declare global {
  interface Window {
    __selectorGrabber?: PickerApi;
  }
}

interface Picked {
  el: Element;
  pick: Pick;
}

const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick'] as const;
const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;

function createPicker(): PickerApi {
  let running = false;
  let picking = false;
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let hl: HTMLElement;
  let tip: HTMLElement;
  let marks: HTMLElement;
  let bar: HTMLElement;
  let count: HTMLElement;
  let toastEl: HTMLElement;
  let panel: HTMLIFrameElement | null = null;
  let hovered: Element | null = null;
  let flashEl: Element | null = null;
  let session = '';
  let frameQueued = false;
  let toastTimer = 0;
  const picked: Picked[] = [];

  // ---------- helpers ----------

  const isOurs = (e: Event): boolean => !!host && e.composedPath().includes(host);

  function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  function place(box: HTMLElement, el: Element): boolean {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      box.style.display = 'none';
      return false;
    }
    box.style.display = 'block';
    box.style.transform = `translate(${r.left}px, ${r.top}px)`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
    return true;
  }

  function toast(message: string): void {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3500);
  }

  function label(el: Element): string {
    const tag = el.localName.toLowerCase();
    const id = el.getAttribute('id');
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
    return `${tag}${id ? `#${id}` : ''}${text ? `  "${text}${text.length === 30 ? '…' : ''}"` : ''}`;
  }

  // ---------- drawing ----------

  function redraw(): void {
    frameQueued = false;
    if (!running) return;
    const target = flashEl ?? (picking ? hovered : null);
    if (target && place(hl, target)) {
      const r = target.getBoundingClientRect();
      tip.style.display = 'block';
      tip.textContent = target.localName === 'iframe' ? 'iframe · elements inside frames come in v0.2' : label(target);
      const top = r.top > 28 ? r.top - 26 : r.bottom + 6;
      tip.style.transform = `translate(${Math.max(4, Math.min(r.left, innerWidth - 320))}px, ${top}px)`;
    } else {
      hl.style.display = 'none';
      tip.style.display = 'none';
    }
    // One outline and one numbered badge per pick.
    while (marks.children.length > picked.length) marks.lastElementChild!.remove();
    picked.forEach((p, i) => {
      let mark = marks.children[i] as HTMLElement | undefined;
      if (!mark) {
        mark = h('div', 'mark');
        mark.append(h('span', 'badge'));
        marks.append(mark);
      }
      (mark.firstElementChild as HTMLElement).textContent = String(i + 1);
      place(mark, p.el);
    });
    count.textContent = picked.length === 1 ? '1 picked' : `${picked.length} picked`;
  }

  function schedule(): void {
    if (!frameQueued) {
      frameQueued = true;
      requestAnimationFrame(redraw);
    }
  }

  // ---------- events ----------

  function onMove(e: MouseEvent): void {
    if (!picking) return;
    hovered = isOurs(e) ? null : (e.target as Element);
    schedule();
  }

  function onBlocked(e: Event): void {
    if (!picking || isOurs(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') togglePick(e as MouseEvent);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      stop();
    } else if (e.key === 'Enter' && picking) {
      e.preventDefault();
      e.stopImmediatePropagation();
      done();
    }
  }

  function onMessage(e: MessageEvent): void {
    if (!panel || e.source !== panel.contentWindow || e.origin !== EXT_ORIGIN) return;
    const data = e.data as { type?: string; session?: string; index?: number };
    if (data.session !== session) return;
    if (data.type === 'sg-close') stop();
    else if (data.type === 'sg-back') resumePicking();
    else if (data.type === 'sg-highlight') {
      const p = typeof data.index === 'number' ? picked[data.index] : undefined;
      flashEl = p?.el ?? null;
      if (flashEl) flashEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      schedule();
    }
  }

  function togglePick(e: MouseEvent): void {
    let el = e.target as Element;
    const inner = e.composedPath()[0];
    // A click inside a shadow root is retargeted to its host; the real element is first in the path.
    if (inner instanceof Element && inner !== el) {
      toast(`That element is inside a shadow root, which XPath cannot reach. Picked its host <${el.localName}> instead.`);
    }
    if (el.localName === 'iframe' || el.localName === 'frame') {
      toast('Picked the frame itself. Elements inside frames come in v0.2.');
    }
    if (el === document.documentElement) el = document.body;

    const existing = picked.findIndex((p) => p.el === el);
    if (existing >= 0) {
      picked.splice(existing, 1);
    } else {
      picked.push({ el, pick: generateLocator(el) });
    }
    schedule();
  }

  // ---------- lifecycle ----------

  function start(): void {
    running = true;
    host = document.createElement('selector-grabber-root');
    host.setAttribute('style', 'all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; display: block !important;');
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = PICKER_CSS;
    hl = h('div', 'hl');
    tip = h('div', 'tip');
    marks = h('div', 'marks');
    toastEl = h('div', 'toast');
    toastEl.setAttribute('role', 'status');

    bar = h('div', 'bar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Selector Grabber');
    const brand = h('span', 'brand', 'Selector Grabber');
    count = h('span', 'count', '0 picked');
    const hint = h('span', 'hint', 'Click elements · Enter = Done · Esc = Cancel');
    const doneBtn = h('button', 'primary', 'Done');
    doneBtn.addEventListener('click', done);
    const cancelBtn = h('button', 'ghost', 'Cancel');
    cancelBtn.addEventListener('click', stop);
    bar.append(brand, count, hint, doneBtn, cancelBtn);

    root.append(style, marks, hl, tip, bar, toastEl);
    document.documentElement.append(host);
    listen(true);
    picking = true;
    schedule();
  }

  function listen(on: boolean): void {
    const pairs: [string, EventListener, boolean][] = [
      ...BLOCKED_EVENTS.map((t): [string, EventListener, boolean] => [t, onBlocked, true]),
      ['mousemove', onMove as EventListener, true],
      ['keydown', onKey as EventListener, true],
      ['scroll', schedule, true],
      ['resize', schedule, true],
      ['message', onMessage as EventListener, false],
    ];
    for (const [type, fn, capture] of pairs) {
      if (on) window.addEventListener(type, fn, capture);
      else window.removeEventListener(type, fn, capture);
    }
  }

  async function done(): Promise<void> {
    if (picked.length === 0) {
      toast('Pick at least one element first.');
      return;
    }
    // Re-check every pick: the page may have changed since it was clicked.
    const picks: Pick[] = picked.map(({ el, pick }) => {
      if (!el.isConnected) return { ...pick, note: 'element left the page; XPath from when it was clicked' };
      if (isUniqueMatch(pick.xpath, el)) return pick;
      return { ...generateLocator(el), note: 'page changed after the click; re-located' };
    });

    if (session) void chrome.storage.local.remove(`sg-session-${session}`); // from an earlier Done
    session = crypto.randomUUID();
    await chrome.storage.local.set({ [`sg-session-${session}`]: { picks, url: location.href, createdAt: Date.now() } });

    picking = false;
    hovered = null;
    bar.style.display = 'none';
    panel = document.createElement('iframe');
    panel.className = 'panel';
    panel.title = 'Selector Grabber results';
    panel.allow = 'clipboard-write';
    panel.src = chrome.runtime.getURL(`panel/panel.html?session=${session}`);
    root!.append(panel);
    schedule();
  }

  function resumePicking(): void {
    panel?.remove();
    panel = null;
    flashEl = null;
    bar.style.display = '';
    picking = true;
    schedule();
  }

  function stop(): void {
    if (!running) return;
    running = false;
    picking = false;
    listen(false);
    host?.remove();
    host = root = panel = null;
    hovered = flashEl = null;
    picked.length = 0;
    if (session) void chrome.storage.local.remove(`sg-session-${session}`);
    session = '';
  }

  return {
    toggle() {
      if (running) stop();
      else start();
    },
  };
}

if (window.__selectorGrabber) {
  window.__selectorGrabber.toggle();
} else {
  window.__selectorGrabber = createPicker();
  window.__selectorGrabber.toggle();
}
