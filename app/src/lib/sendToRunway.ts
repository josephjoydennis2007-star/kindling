/**
 * sendToRunway — the "Option D" bridge between Kindling and the
 * Runway web app, designed to USE THE USER'S EXISTING UNLIMITED
 * SUBSCRIPTION instead of burning API credits.
 *
 * Two modes:
 *
 *   1. NO-EXTENSION fallback. The button:
 *        - copies the prompt to the clipboard
 *        - opens (or focuses) runwayml.com in a stable named window
 *        - shows a toast: "Prompt copied — paste into Runway, click
 *          Generate, then come back and paste the result URL onto the
 *          shot."
 *      Slow but works for everyone with zero install. ToS-clean.
 *
 *   2. EXTENSION mode. If the Kindling Runway Bridge extension is
 *      installed, it listens for `kindling:send-to-runway` postMessages
 *      and:
 *        - focuses the Runway tab
 *        - auto-fills the prompt textarea
 *        - shows a small "Send back to Kindling" overlay near the
 *          generated frame
 *      The user still clicks Generate themselves so we never automate
 *      Runway's controls or violate their ToS.
 *
 * Both modes converge on the same return path: a `kindling:runway-result`
 * window message with { shotId, url, kind } that this module's
 * `attachReturnedAsset` reads to drop the result onto the matching shot.
 */

import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';

/** A message we post on the window for the extension's content
 *  script to pick up. */
export interface SendToRunwayPayload {
  source: 'kindling';
  kind: 'send-prompt';
  shotId?: string;
  shotLabel?: string;
  prompt: string;
  /** image vs video — Runway's interface differs slightly */
  target: 'image' | 'video';
}

/** A return message from the extension after the user has clicked
 *  Generate + then "Send back to Kindling" in Runway. */
export interface RunwayReturnPayload {
  source: 'kindling-ext';
  kind: 'runway-result';
  shotId?: string;
  url: string;
  assetKind: 'image' | 'video';
}

const RUNWAY_WINDOW_NAME = 'kindling_runway';

/** Tracks whether we've detected the extension. The content script
 *  pings us shortly after page load. */
let extensionPresent = false;

/** Initialize once at app boot — wires the message listeners. */
export function installRunwayBridge(): void {
  // Listen for the extension's "I'm here" ping.
  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.source === 'kindling-ext' && d.kind === 'hello') {
      extensionPresent = true;
      // Quiet — don't spam toasts on every reload. The toolbar will
      // surface this state via the badge instead.
    }
    if (d.source === 'kindling-ext' && d.kind === 'runway-result') {
      attachReturnedAsset(d as RunwayReturnPayload);
    }
  });
}

export function isRunwayBridgeInstalled(): boolean {
  return extensionPresent;
}

/**
 * Push a prompt at Runway. Picks extension mode if the bridge is
 * installed; otherwise copy-to-clipboard fallback.
 */
export async function sendPromptToRunway(opts: {
  prompt: string;
  shotId?: string;
  shotLabel?: string;
  target?: 'image' | 'video';
}): Promise<void> {
  const target = opts.target || 'image';
  const payload: SendToRunwayPayload = {
    source: 'kindling',
    kind: 'send-prompt',
    shotId: opts.shotId,
    shotLabel: opts.shotLabel,
    prompt: opts.prompt,
    target,
  };

  // Always pop Runway in a stable named tab so re-clicks reuse the
  // existing logged-in session.
  const runwayUrl = target === 'video'
    ? 'https://app.runwayml.com/video-tools/teams/personal/ai-tools/gen-4'
    : 'https://app.runwayml.com/video-tools/teams/personal/ai-tools/generative-images';

  if (extensionPresent) {
    // Extension takes care of focusing the right tab AND pasting.
    window.postMessage(payload, '*');
    // Still ensure the tab exists. The extension will focus the
    // existing one if it's already open.
    window.open(runwayUrl, RUNWAY_WINDOW_NAME);
    toast.success('Sent to Runway — switch to that tab and click Generate', {
      description: 'When the result loads, hit the "Send to Kindling" button the extension adds.',
      duration: 8000,
    });
    return;
  }

  // No extension — fallback: clipboard + open tab + instruct.
  try {
    await navigator.clipboard.writeText(opts.prompt);
  } catch {
    // clipboard API may fail in non-secure contexts — fall through.
  }
  window.open(runwayUrl, RUNWAY_WINDOW_NAME);
  toast.success('Prompt copied to clipboard — Runway opened in a tab', {
    description:
      'Install the Kindling Runway Bridge extension for a one-click flow. Otherwise: paste into Runway (Ctrl+V), Generate, then drag the result back into the shot here.',
    duration: 10000,
  });
}

/**
 * The extension calls back here when the user clicks "Send to
 * Kindling" inside Runway after their generation finishes.
 *
 * If the original send included a shotId we attach to that shot's
 * storyboard slot. If not (e.g. exploratory prompts from the agent),
 * we drop the asset into the global Asset library.
 */
export function attachReturnedAsset(payload: RunwayReturnPayload): void {
  const { shotId, url, assetKind } = payload;
  if (!url) return;
  const state = useAppStore.getState();

  if (shotId) {
    const target = (state.shots as any)[shotId];
    if (target) {
      // Images go directly on the shot's storyboard slot. Videos go
      // into Assets because we don't have a per-shot video slot yet.
      if (assetKind === 'video') {
        state.addAsset({
          name: `Runway video — ${target.description?.slice(0, 40) || 'shot'}`,
          kind: 'reference',
          data: url,
          size: 0,
        });
      } else {
        state.updateShot(shotId, { storyboard: url });
      }
      toast.success(assetKind === 'video' ? 'Runway video saved to Assets' : 'Runway image attached to shot');
      return;
    }
  }
  // No matching shot — drop into Assets.
  state.addAsset({
    name: assetKind === 'video' ? 'Runway video' : 'Runway image',
    kind: assetKind === 'video' ? 'reference' : 'image',
    data: url,
    size: 0,
  });
  toast.success(`Runway ${assetKind} saved to Assets`);
}
