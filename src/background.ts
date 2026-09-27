/**
 * Service worker. One job: when the toolbar icon is clicked, inject the picker into that tab.
 *
 * The picker is injected on demand (activeTab + scripting) rather than declared as a content
 * script, so it works on tabs that were already open before the extension was installed:
 * no reload needed. That is the failure mode this project exists to avoid.
 */

const BLOCKED: { test: RegExp; reason: string }[] = [
  { test: /^(chrome|brave|edge|opera|vivaldi|about|chrome-search|devtools|view-source):/i, reason: 'Browsers do not let extensions run on their own pages (settings, new tab, extensions).' },
  { test: /^chrome-extension:/i, reason: 'Extensions cannot run inside other extensions.' },
  { test: /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i, reason: 'Browsers do not let extensions run on the Chrome Web Store.' },
];

export async function activate(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  const url = tab.url ?? '';

  const blocked = BLOCKED.find((b) => b.test.test(url));
  if (blocked) return explain(tab.id, blocked.reason);

  if (url.startsWith('file:') && !(await chrome.extension.isAllowedFileSchemeAccess())) {
    return explain(
      tab.id,
      'To use Selector Grabber on local files, open the extensions page, click Details on Selector Grabber, and turn on "Allow access to file URLs".',
    );
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['picker.js'] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    explain(tab.id, `This page does not allow extensions to run (${message}). PDF viewers and some built-in pages block them.`);
  }
}

/** Shows the reason in a small popup anchored to the toolbar icon, with a badge as a fallback. */
async function explain(tabId: number, reason: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#B91C1C' });
  await chrome.action.setBadgeText({ tabId, text: '!' });
  await chrome.action.setTitle({ tabId, title: `Selector Grabber can't run here: ${reason}` });
  const popup = `blocked.html?reason=${encodeURIComponent(reason)}`;
  try {
    await chrome.action.setPopup({ tabId, popup });
    await chrome.action.openPopup();
  } catch {
    /* openPopup can be unavailable; the badge and tooltip still explain */
  } finally {
    // Clear it again so the next click on a normal page injects the picker as usual.
    await chrome.action.setPopup({ tabId, popup: '' });
  }
}

chrome.action.onClicked.addListener((tab) => void activate(tab));

// Clear the "!" badge when the tab navigates somewhere else.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') void chrome.action.setBadgeText({ tabId, text: '' });
});

// The E2E test build calls this from the service worker, because tests cannot click the toolbar.
(globalThis as unknown as { sgActivate: typeof activate }).sgActivate = activate;
