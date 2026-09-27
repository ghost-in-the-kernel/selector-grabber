// Fills in the reason passed by the service worker. Inline scripts are not allowed in MV3 pages.
const reason = new URLSearchParams(location.search).get('reason') ?? 'This page does not allow extensions.';
document.getElementById('reason')!.textContent = reason;
