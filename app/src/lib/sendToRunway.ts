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

/** Event the in-app RunwayPromptDialog listens for. We always surface the
 *  prompt in a copyable panel because Runway's prompt box can't be reliably
 *  auto-filled. */
export const RUNWAY_PROMPT_EVENT = 'app:runwayPrompt';
export interface RunwayPromptDetail {
  prompt: string;
  target: 'image' | 'video';
  shotId?: string;
  shotLabel?: string;
  /** Reference image URLs to hand to Runway (first frame, last frame, b-roll
   *  frame). For a video these are the start/end frames Runway animates. */
  imageUrls?: string[];
}

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
  /** Reference image URLs the extension can auto-attach to Runway's uploader. */
  imageUrls?: string[];
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
  imageUrls?: string[];
}): Promise<void> {
  const target = opts.target || 'image';
  // Show ALL reference images in the panel (hosted URLs AND base64) so they
  // always appear for you to drag/open — previously base64 frames were filtered
  // out, which is why "nothing showed up". The extension prefers hosted URLs but
  // can handle either.
  const imageUrls = (opts.imageUrls || []).filter(Boolean) as string[];
  const payload: SendToRunwayPayload = {
    source: 'kindling',
    kind: 'send-prompt',
    shotId: opts.shotId,
    shotLabel: opts.shotLabel,
    prompt: opts.prompt,
    target,
    imageUrls,
  };

  // ALWAYS copy the prompt to the clipboard first — this is the reliable
  // path. Runway's React prompt box frequently rejects programmatic input,
  // so the user pastes (Ctrl/Cmd+V) instead of trusting an auto-fill.
  let copied = false;
  try {
    await navigator.clipboard.writeText(opts.prompt);
    copied = true;
  } catch {
    // clipboard API may fail in non-secure contexts — the dialog still shows
    // the prompt with a manual Copy button as a fallback.
  }

  // ALWAYS surface the prompt in the in-app dialog so it's visible + copyable
  // regardless of whether the extension or auto-fill works. This fixes the
  // "I'm taken to Runway but the prompt never appears" problem.
  const detail: RunwayPromptDetail = {
    prompt: opts.prompt,
    target,
    shotId: opts.shotId,
    shotLabel: opts.shotLabel,
    imageUrls,
  };
  document.dispatchEvent(new CustomEvent<RunwayPromptDetail>(RUNWAY_PROMPT_EVENT, { detail }));

  // If the bridge extension is present, ALSO try to auto-fill (best-effort) —
  // including the reference images so it can attach them to Runway's uploader.
  if (extensionPresent) {
    window.postMessage(payload, '*');
  }

  const refNote = imageUrls.length
    ? ` ${imageUrls.length} reference image${imageUrls.length === 1 ? '' : 's'} ready in the panel.`
    : '';
  toast.success(copied ? 'Prompt copied — paste it into Runway' : 'Prompt ready — copy it from the panel', {
    description: `A panel is open (bottom-right). Open Runway, paste, and Generate.${refNote}`,
    duration: 6000,
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
      // Images go on the shot's storyboard slot; videos now go on the shot's
      // own video slot (shown in the Storyboard in place of the frame).
      if (assetKind === 'video') {
        state.updateShot(shotId, { video: url });
      } else {
        state.updateShot(shotId, { storyboard: url });
      }
      toast.success(assetKind === 'video' ? 'Runway video attached to shot' : 'Runway image attached to shot');
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
