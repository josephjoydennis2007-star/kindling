/**
 * Content script that runs on kindling-1d29d.web.app.
 *
 * - Pings the page so Kindling knows the extension is installed
 *   (postMessage with source 'kindling-ext', kind 'hello').
 * - Listens for page postMessages with source 'kindling' / kind
 *   'send-prompt' and forwards them to the background worker which
 *   relays to the Runway tab.
 * - Listens for messages FROM the background worker carrying a
 *   generated URL, and posts them back to the page so the Kindling
 *   bridge code can attach the asset to the matching shot.
 */

// Tell Kindling we're alive.
function announce() {
  window.postMessage({ source: 'kindling-ext', kind: 'hello', version: '1.0.0' }, '*');
}
announce();
// Re-announce on hash route changes (Kindling is an SPA).
window.addEventListener('hashchange', announce);

// Page → background (Kindling wants to send a prompt to Runway).
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.source !== 'kindling') return;
  if (d.kind === 'send-prompt') {
    chrome.runtime.sendMessage({
      kind: 'send-prompt',
      prompt: d.prompt,
      shotId: d.shotId,
      shotLabel: d.shotLabel,
      target: d.target || 'image',
    }, (resp) => {
      if (chrome.runtime.lastError) {
        // Background worker not reachable — log only.
        console.warn('[Kindling Bridge] send-prompt failed:', chrome.runtime.lastError.message);
      }
    });
  }
});

// Background → page (a Runway result is being delivered).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind === 'deliver-result') {
    window.postMessage({
      source: 'kindling-ext',
      kind: 'runway-result',
      shotId: msg.shotId,
      url: msg.url,
      assetKind: msg.assetKind || 'image',
    }, '*');
    sendResponse({ ok: true });
  }
});

// Tell background we're a Kindling tab so it can route results back here.
chrome.runtime.sendMessage({ kind: 'kindling-hello' });
