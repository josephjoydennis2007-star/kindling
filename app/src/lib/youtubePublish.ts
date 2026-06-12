/**
 * YouTube publishing — push the finished video + packaging straight to the
 * user's channel, free, using THEIR Google account.
 *
 * How it stays free: the YouTube Data API has a free daily quota (an upload
 * costs ~1600 units of the 10,000/day default — plenty for a creator). The
 * user supplies their own OAuth *Client ID* (a public identifier, safe in the
 * browser; no secret involved) created once in Google Cloud Console — the
 * setup card in the Publish panel walks through it.
 *
 * Auth: Google Identity Services token flow (loaded on demand). The access
 * token lives in memory/session only — never persisted.
 */

import type { YouTubePack } from '@/types';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

let accessToken: string | null = null;
let tokenExpiry = 0;

declare global {
  interface Window { google?: any }
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in script'));
    document.head.appendChild(s);
  });
}

export function isConnected(): boolean {
  return !!accessToken && Date.now() < tokenExpiry;
}

/** Pop the Google consent flow and hold a YouTube-scoped access token. */
export async function connectYouTube(clientId: string): Promise<{ ok: boolean; error?: string }> {
  if (!clientId) return { ok: false, error: 'Paste your Google OAuth Client ID first (free — see the setup steps).' };
  try {
    await loadGis();
    return await new Promise((resolve) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp: any) => {
          if (resp?.access_token) {
            accessToken = resp.access_token;
            tokenExpiry = Date.now() + ((resp.expires_in || 3500) * 1000) - 60_000;
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: resp?.error || 'No token returned' });
          }
        },
        error_callback: (err: any) => resolve({ ok: false, error: err?.message || err?.type || 'Sign-in cancelled' }),
      });
      client.requestAccessToken();
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Google sign-in failed' };
  }
}

export function disconnectYouTube(): void {
  accessToken = null;
  tokenExpiry = 0;
}

/** Tags string → API array (comma separated, trimmed, ≤500 chars total). */
export function parseTags(tags?: string): string[] {
  if (!tags) return [];
  const out: string[] = [];
  let total = 0;
  for (const raw of tags.split(',')) {
    const t = raw.trim().replace(/^#/, '');
    if (!t) continue;
    if (total + t.length > 480) break;
    out.push(t);
    total += t.length + 1;
  }
  return out;
}

/** Compose the upload snippet/status from the YouTube pack. */
export function buildUploadMeta(pack: YouTubePack, opts: { privacy?: 'private' | 'unlisted' | 'public' } = {}) {
  const description = [pack.description || '', pack.chapters ? `\n${pack.chapters}` : '', pack.hashtags ? `\n${pack.hashtags}` : '']
    .join('').trim();
  return {
    snippet: {
      title: (pack.title || pack.idea || 'Untitled video').slice(0, 100),
      description: description.slice(0, 4900),
      tags: parseTags(pack.tags),
      categoryId: '24', // Entertainment
    },
    status: {
      privacyStatus: opts.privacy || 'private',
      selfDeclaredMadeForKids: false,
    },
  };
}

export interface UploadProgress { phase: 'uploading' | 'processing' | 'done'; percent?: number }

/**
 * Upload a video file with its metadata. Returns the new videoId.
 * Uses the resumable protocol so big files survive hiccups.
 */
export async function uploadVideo(
  file: File,
  pack: YouTubePack,
  opts: { privacy?: 'private' | 'unlisted' | 'public'; onProgress?: (p: UploadProgress) => void } = {},
): Promise<{ ok: boolean; videoId?: string; error?: string }> {
  if (!isConnected()) return { ok: false, error: 'Connect YouTube first.' };
  try {
    // 1) Start a resumable session.
    const meta = buildUploadMeta(pack, opts);
    const init = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(file.size),
          'x-upload-content-type': file.type || 'video/mp4',
        },
        body: JSON.stringify(meta),
      },
    );
    if (!init.ok) return { ok: false, error: `YouTube init ${init.status}: ${(await init.text()).slice(0, 300)}` };
    const sessionUrl = init.headers.get('location');
    if (!sessionUrl) return { ok: false, error: 'YouTube gave no upload session URL' };

    // 2) PUT the bytes (single shot; XHR for progress events).
    opts.onProgress?.({ phase: 'uploading', percent: 0 });
    const videoId = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', sessionUrl);
      xhr.setRequestHeader('content-type', file.type || 'video/mp4');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.({ phase: 'uploading', percent: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText).id); } catch { reject(new Error('Upload finished but no video id returned')); }
        } else reject(new Error(`YouTube upload ${xhr.status}: ${xhr.responseText.slice(0, 300)}`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(file);
    });
    opts.onProgress?.({ phase: 'processing' });

    // 3) Custom thumbnail (best-effort — needs a verified channel).
    if (pack.thumbnail && /^https?:\/\//i.test(pack.thumbnail)) {
      try {
        const tr = await fetch(pack.thumbnail);
        const tb = await tr.blob();
        await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}`, 'content-type': tb.type || 'image/jpeg' },
          body: tb,
        });
      } catch { /* thumbnail is optional */ }
    }

    opts.onProgress?.({ phase: 'done', percent: 100 });
    return { ok: true, videoId };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Upload failed' };
  }
}
