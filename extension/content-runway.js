/**
 * Content script that runs on app.runwayml.com.
 *
 * - Listens for `paste-prompt` messages from the background worker
 *   and stuffs the prompt into Runway's text-input control. We try
 *   a few different selectors because Runway's React app names its
 *   inputs differently across the image and video editors.
 * - Renders a small floating "Send to Kindling" button beside the
 *   generated frame so the user can route the URL back when ready.
 *
 * IMPORTANT: We deliberately do NOT click the Generate button. The
 * user always presses Generate themselves — that keeps this strictly
 * within the consumer terms of service. The extension is a paste +
 * relay tool, not an automation tool.
 */

let pendingShotId = null;
let pendingShotLabel = null;
let pendingTarget = 'image';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.kind === 'paste-prompt') {
    pendingShotId = msg.shotId || null;
    pendingShotLabel = msg.shotLabel || null;
    pendingTarget = msg.target || 'image';
    pasteIntoRunway(msg.prompt).then((ok) => sendResponse({ ok }));
    return true;
  }
});

async function pasteIntoRunway(prompt) {
  // Try multiple selectors — Runway's text input differs per page.
  const selectors = [
    'textarea[placeholder*="prompt"i]',
    'textarea[placeholder*="describe"i]',
    'textarea[name*="prompt"i]',
    'div[contenteditable="true"]',
    'textarea',
  ];
  let input = null;
  for (let i = 0; i < 40 && !input; i++) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { input = el; break; }
    }
    if (input) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!input) {
    bannerNotice('Could not find Runway\'s prompt field. Paste manually (Ctrl+V) — the prompt is on your clipboard.');
    try { await navigator.clipboard.writeText(prompt); } catch {}
    return false;
  }

  // Native textarea — use the descriptor setter trick so React picks
  // up the value change.
  if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, prompt);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // contenteditable div — set textContent + dispatch input.
    input.focus();
    input.textContent = prompt;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt, inputType: 'insertText' }));
  }
  input.focus();
  bannerNotice('Prompt pasted by Kindling. Click Generate when ready, then "Send to Kindling".');
  // Mark that we have an outgoing send-back ready.
  ensureSendBackPanel();
  return true;
}

let panel = null;
function ensureSendBackPanel() {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'kindling-runway-send-back';
  panel.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
    'background:#1a0f29', 'color:#fff', 'font:13px/1.3 Inter,system-ui,sans-serif',
    'padding:12px 14px', 'border-radius:10px', 'box-shadow:0 12px 32px rgba(0,0,0,0.45)',
    'max-width:280px', 'border:1px solid rgba(168,85,247,0.6)',
  ].join(';');
  panel.innerHTML = `
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;color:#a855f7;margin-bottom:6px;">
      Kindling bridge
    </div>
    <div style="font-size:12px;margin-bottom:10px;">
      When the result loads, right-click it &rarr; "Copy image address", then click the button below.
    </div>
    <input id="kindling-rwy-url" type="text" placeholder="Paste result URL here…"
           style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#0f0820;color:#fff;font-size:12px;margin-bottom:8px;box-sizing:border-box;" />
    <button id="kindling-rwy-send"
            style="width:100%;padding:8px;border-radius:6px;border:0;background:#a855f7;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">
      Send to Kindling
    </button>
    <button id="kindling-rwy-close"
            style="position:absolute;top:6px;right:8px;background:transparent;border:0;color:#888;cursor:pointer;font-size:16px;line-height:1;">
      &times;
    </button>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#kindling-rwy-close').addEventListener('click', () => {
    panel.remove(); panel = null;
  });
  panel.querySelector('#kindling-rwy-send').addEventListener('click', () => {
    const url = panel.querySelector('#kindling-rwy-url').value.trim();
    if (!url) { bannerNotice('Paste the result URL first.'); return; }
    const kind = /\.(mp4|webm|mov)(\?|$)/i.test(url) || pendingTarget === 'video' ? 'video' : 'image';
    chrome.runtime.sendMessage({
      kind: 'runway-result',
      url,
      shotId: pendingShotId,
      assetKind: kind,
    }, (resp) => {
      if (resp?.ok) {
        bannerNotice('Sent back to Kindling. Switch tabs to see it on the shot.');
        if (panel) { panel.remove(); panel = null; }
      } else {
        bannerNotice('Could not reach Kindling tab. Is it still open?');
      }
    });
  });
}

let bannerTimer = null;
function bannerNotice(text) {
  let banner = document.getElementById('kindling-runway-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'kindling-runway-banner';
    banner.style.cssText = [
      'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483647', 'background:#0f0820', 'color:#fff',
      'font:13px/1.3 Inter,system-ui,sans-serif', 'padding:10px 14px',
      'border-radius:8px', 'border:1px solid rgba(168,85,247,0.6)',
      'box-shadow:0 8px 24px rgba(0,0,0,0.4)', 'max-width:520px', 'text-align:center',
    ].join(';');
    document.body.appendChild(banner);
  }
  banner.textContent = text;
  banner.style.opacity = '1';
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    banner.style.transition = 'opacity 0.4s';
    banner.style.opacity = '0';
  }, 5000);
}
