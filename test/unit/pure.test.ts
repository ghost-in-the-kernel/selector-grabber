import { describe, expect, it } from 'vitest';
import { xpathLiteral } from '../../src/engine/literal';
import { looksGenerated } from '../../src/engine/generated';
import { formatAll, javaString, ordinal, type Pick } from '../../src/format';

describe('xpathLiteral', () => {
  it('wraps plain text in single quotes', () => expect(xpathLiteral('Bulbasaur')).toBe("'Bulbasaur'"));
  it('uses double quotes around an apostrophe', () => expect(xpathLiteral("It's")).toBe(`"It's"`));
  it('keeps double quotes inside single quotes', () => expect(xpathLiteral('say "hi"')).toBe(`'say "hi"'`));
  it('builds concat() when both quote types appear', () =>
    expect(xpathLiteral(`It's "new"`)).toBe(`concat('It', "'", 's "new"')`));
  it('handles leading and repeated apostrophes', () =>
    expect(xpathLiteral(`'a''b" `)).toBe(`concat('', "'", 'a', "'", '', "'", 'b" ')`));
});

describe('looksGenerated', () => {
  it.each(['ember123', ':r1:', 'react-select-3-input', 'css-1x2y3z', 'sc-AxjAm', 'mui-12345', '3f2a9c1e-5b7d-4e8a', 'product-card-4821', '_xCG5apS3Hrzw0PEPqMW4yQI_60', 'kO001e', 'x'.repeat(60), ''])(
    'flags %s',
    (v) => expect(looksGenerated(v)).toBe(true),
  );
  it.each(['pokedex', 'login-submit', 'email', 'input-12', 'search', 'main-menu', 'root', 'gen-1', 'loginSubmit', 'searchBox', 'APjFqb', 'rso'])('keeps %s', (v) =>
    expect(looksGenerated(v)).toBe(false),
  );
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [102, '102nd'],
  ])('%i -> %s', (n, s) => expect(ordinal(n)).toBe(s));
});

describe('Java formatter', () => {
  const picks: Pick[] = [
    { xpath: "//table[@id='pokedex']", rung: 2, strategy: 'id', stability: 'Strong', description: 'table#pokedex', tag: 'table', text: '' },
    { xpath: `//p[normalize-space()=concat('It', "'", 's "new"')]`, rung: 5, strategy: 'visible text', stability: 'OK', description: 'p "It\'s \\"new\\""', tag: 'p', text: '' },
  ];

  it('escapes backslashes and double quotes for Java', () => expect(javaString('a"b\\c')).toBe('"a\\"b\\\\c"'));

  it('writes Playwright locators with the xpath= prefix', () => {
    expect(formatAll(picks.slice(0, 1), 'playwright', 'code')).toBe(
      `// 1st selector: table#pokedex  [Strong]\npage.locator("xpath=//table[@id='pokedex']");`,
    );
  });

  it('writes Selenium locators', () => {
    expect(formatAll(picks.slice(0, 1), 'selenium', 'code')).toBe(
      `// 1st selector: table#pokedex  [Strong]\ndriver.findElement(By.xpath("//table[@id='pokedex']"));`,
    );
  });

  it('keeps concat() XPaths valid inside a Java string', () => {
    const line = formatAll(picks.slice(1), 'selenium', 'code').split('\n')[1];
    expect(line).toBe(`driver.findElement(By.xpath("//p[normalize-space()=concat('It', \\"'\\", 's \\"new\\"')]"));`);
  });

  it('raw mode is one XPath per line', () => {
    expect(formatAll(picks, 'playwright', 'raw')).toBe(`${picks[0].xpath}\n${picks[1].xpath}`);
  });
});
