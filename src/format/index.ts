/**
 * Turns picked locators into text for the clipboard. Pure functions: no DOM, no Chrome APIs.
 * v0.1 emits Java only; C#, TypeScript and Python arrive in v0.2 as sibling formatters.
 */
import type { LocatorResult } from '../engine';

export type Framework = 'playwright' | 'selenium';
export type OutputMode = 'code' | 'raw';

export interface Pick extends LocatorResult {
  /** Set when the element changed between the click and Done and had to be re-located. */
  note?: string;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** A Java string literal: escapes backslashes and double quotes, keeps everything else. */
export function javaString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Comment text must stay on one line. */
function oneLine(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, ' ');
}

export function javaLine(p: Pick, framework: Framework): string {
  // Playwright auto-detects XPath only when it starts with // or .., so a positional
  // expression such as (//tr)[3] needs the explicit xpath= prefix. Always adding it is simplest.
  return framework === 'playwright'
    ? `page.locator(${javaString(`xpath=${p.xpath}`)});`
    : `driver.findElement(By.xpath(${javaString(p.xpath)}));`;
}

export function commentLine(p: Pick, index: number): string {
  const note = p.note ? `  (${p.note})` : '';
  return `// ${ordinal(index + 1)} selector: ${oneLine(p.description)}  [${p.stability}]${oneLine(note)}`;
}

/** The full clipboard text for "Copy all". */
export function formatAll(picks: Pick[], framework: Framework, mode: OutputMode): string {
  if (mode === 'raw') return picks.map((p) => p.xpath).join('\n');
  return picks.map((p, i) => `${commentLine(p, i)}\n${javaLine(p, framework)}`).join('\n');
}
