/**
 * Results panel: an extension page shown in an iframe over the site.
 * It reads the picks the picker saved to chrome.storage.local under a one-time session key,
 * renders one card per pick, and copies the formatted text.
 */
import { commentLine, formatAll, javaLine, ordinal, type Framework, type OutputMode, type Pick } from '../format';

interface Session {
  picks: Pick[];
  url: string;
}

const params = new URLSearchParams(location.search);
const sessionId = params.get('session') ?? '';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let picks: Pick[] = [];
let framework: Framework = 'playwright';
let mode: OutputMode = 'code';

function post(type: string, extra: Record<string, unknown> = {}): void {
  // The picker checks that messages come from this iframe and this extension's origin.
  window.parent.postMessage({ type, session: sessionId, ...extra }, '*');
}

async function copy(text: string): Promise<boolean> {
  try {
    // A permission prompt that never resolves would leave the button stuck, so give up after 1 s.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), 1000));
    await Promise.race([navigator.clipboard.writeText(text), timeout]);
    return true;
  } catch {
    // Some sites forbid clipboard access for embedded frames; the classic path still works on a click.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function flash(button: HTMLButtonElement, ok: boolean): void {
  const original = button.dataset.label ?? button.textContent ?? '';
  button.dataset.label = original;
  button.textContent = ok ? 'Copied ✓' : 'Copy failed';
  setTimeout(() => (button.textContent = original), 1500);
}

function lineFor(p: Pick): string {
  return mode === 'raw' ? p.xpath : javaLine(p, framework);
}

function render(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-framework]')) {
    b.setAttribute('aria-checked', String(b.dataset.framework === framework));
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  }

  const list = $('list');
  list.replaceChildren();
  if (picks.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'This session has expired. Close the panel and click the toolbar icon again.';
    list.append(li);
    return;
  }

  picks.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'card';
    li.addEventListener('mouseenter', () => post('sg-highlight', { index: i }));
    li.addEventListener('mouseleave', () => post('sg-highlight', { index: -1 }));

    const head = document.createElement('div');
    head.className = 'card-head';
    const ord = document.createElement('span');
    ord.className = 'ordinal';
    ord.textContent = `${ordinal(i + 1)} selector`;
    const desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = p.description;
    desc.title = p.description;
    const pill = document.createElement('span');
    pill.className = `pill ${p.stability}`;
    pill.textContent = p.stability;
    pill.title = `Rung ${p.rung}: ${p.strategy}`;
    const btn = document.createElement('button');
    btn.className = 'copy-one';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const text = mode === 'raw' ? p.xpath : `${commentLine(p, i)}\n${javaLine(p, framework)}`;
      flash(btn, await copy(text));
    });
    head.append(ord, desc, pill, btn);

    const pre = document.createElement('pre');
    pre.textContent = lineFor(p);

    li.append(head, pre);
    if (p.text && !p.description.includes(p.text)) {
      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = `Text: ${p.text}`;
      li.append(meta);
    }
    if (p.note) {
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = `Note: ${p.note}`;
      li.append(note);
    }
    list.append(li);
  });
}

async function init(): Promise<void> {
  const key = `sg-session-${sessionId}`;
  const stored = await chrome.storage.local.get([key, 'sg-framework', 'sg-mode']);
  const session = stored[key] as Session | undefined;
  framework = (stored['sg-framework'] as Framework) ?? 'playwright';
  mode = (stored['sg-mode'] as OutputMode) ?? 'code';
  // Keep the session until the panel closes, so "Back to picking" and a reload both work;
  // the picker deletes it on close.
  picks = session?.picks ?? [];

  const host = session ? new URL(session.url).hostname : '';
  $('summary').textContent = picks.length
    ? `${picks.length} ${picks.length === 1 ? 'selector' : 'selectors'}${host ? ` · ${host}` : ''}`
    : 'No selectors';

  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-framework]')) {
    b.addEventListener('click', () => {
      framework = b.dataset.framework as Framework;
      void chrome.storage.local.set({ 'sg-framework': framework });
      render();
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    b.addEventListener('click', () => {
      mode = b.dataset.mode as OutputMode;
      void chrome.storage.local.set({ 'sg-mode': mode });
      render();
    });
  }
  $('close').addEventListener('click', () => post('sg-close'));
  $('back').addEventListener('click', () => post('sg-back'));
  const copyAll = $<HTMLButtonElement>('copyAll');
  copyAll.addEventListener('click', async () => flash(copyAll, await copy(formatAll(picks, framework, mode))));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') post('sg-close');
  });

  render();
  copyAll.focus();
}

void init();
