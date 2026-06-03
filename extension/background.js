/**
 * Kindling Runway Bridge — background service worker.
 *
 * Role: cross-tab postman between Kindling and Runway.
 * - When Kindling's content script forwards a prompt, find or open
 *   the Runway tab and relay the message to its content script.
 * - When Runway's content script reports a generated URL, find the
 *   most-recently-active Kindling tab and relay it back.
 *
 * Nothing here knows your credentials. The extension never logs in
 * to Runway or Kindling — it just routes messages between tabs the
 * USER is already signed into.
 */

const RUNWAY_MATCH = /^https:\/\/(app\.)?runwayml\.com\//;
const KINDLING_MATCH = /^https:\/\/(.*\.)?kindling-1d29d\.web\.app\/|^http:\/\/localhost[:/]/;

let lastKindlingTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  // ---- Kindling → Runway ----
  if (msg.kind === 'send-prompt') {
    if (sender.tab && KINDLING_MATCH.test(sender.tab.url || '')) {
      lastKindlingTabId = sender.tab.id;
    }
    routeToRunwayTab(msg).then((ok) => sendResponse({ ok }));
    return true; // async response
  }

  // ---- Runway → Kindling ----
  if (msg.kind === 'runway-result') {
    routeToKindlingTab(msg).then((ok) => sendResponse({ ok }));
    return true;
  }

  // ---- Health ping from Kindling content script ----
  if (msg.kind === 'kindling-hello') {
    if (sender.tab) lastKindlingTabId = sender.tab.id;
    sendResponse({ ok: true });
    return;
  }
});

async function routeToRunwayTab(payload) {
  // Look for an open Runway tab. If none, open one. We always pick
  // app.runwayml.com (the editor) over the marketing site.
  const tabs = await chrome.tabs.query({ url: 'https://app.runwayml.com/*' });
  let target = tabs[0];
  if (!target) {
    target = await chrome.tabs.create({
      url: payload.target === 'video'
        ? 'https://app.runwayml.com/video-tools/teams/personal/ai-tools/gen-4'
        : 'https://app.runwayml.com/video-tools/teams/personal/ai-tools/generative-images',
      active: true,
    });
    // Give the tab a moment to load the content script before we
    // try to deliver the prompt.
    await waitForTabLoad(target.id);
  } else {
    await chrome.tabs.update(target.id, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
  }
  try {
    await chrome.tabs.sendMessage(target.id, {
      kind: 'paste-prompt',
      prompt: payload.prompt,
      shotId: payload.shotId,
      shotLabel: payload.shotLabel,
      target: payload.target,
    });
    return true;
  } catch (e) {
    // Tab probably hasn't loaded our content script yet — give the
    // user instructions via a notification.
    console.warn('[Kindling Bridge] Failed to message Runway tab:', e);
    return false;
  }
}

async function routeToKindlingTab(payload) {
  // Prefer the last active Kindling tab we know about.
  let target = null;
  if (lastKindlingTabId) {
    try {
      target = await chrome.tabs.get(lastKindlingTabId);
    } catch { /* tab closed */ }
  }
  if (!target) {
    const tabs = await chrome.tabs.query({});
    target = tabs.find((t) => KINDLING_MATCH.test(t.url || ''));
  }
  if (!target) {
    console.warn('[Kindling Bridge] No Kindling tab open to deliver result to.');
    return false;
  }
  try {
    await chrome.tabs.sendMessage(target.id, {
      kind: 'deliver-result',
      url: payload.url,
      shotId: payload.shotId,
      assetKind: payload.assetKind || 'image',
    });
    // Focus Kindling so the user sees the toast confirming the attach.
    chrome.tabs.update(target.id, { active: true });
    chrome.windows.update(target.windowId, { focused: true });
    return true;
  } catch (e) {
    console.warn('[Kindling Bridge] Failed to message Kindling tab:', e);
    return false;
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // Extra ~800ms for the React app to mount + our content script
        // to subscribe to messages.
        setTimeout(resolve, 800);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Safety timeout — give up after 12s.
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 12_000);
  });
}
