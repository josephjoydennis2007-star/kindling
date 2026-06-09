/**
 * Cloud media upload — the fix for "my computer/RAM keeps filling up".
 *
 * THE PROBLEM: images were stored as base64 `data:` URLs INLINE in the story
 * JSON, so every picture lived in RAM (when open), on local disk (IndexedDB),
 * and broke Firestore sync (1 MB doc cap). The cloud sat empty.
 *
 * THE FIX: upload the bytes to a real media host and keep only the tiny URL in
 * the story. Firebase Storage now requires a paid (Blaze) plan, so we support
 * FREE, no-credit-card hosts instead, tried in order:
 *
 *   1. Cloudinary  — 25 GB free, images AND video, browser "unsigned" upload
 *                    (cloud name + unsigned preset; no secret in the browser).
 *   2. GitHub repo — commit the file to a PUBLIC repo via the contents API and
 *                    serve it from the jsDelivr CDN. Reuses a GitHub token.
 *   3. Local       — if nothing is configured/online, keep the data URL on the
 *                    device (graceful) and warn once. The migration tool can
 *                    move it to the cloud later once a host is set up.
 *
 * Hosted http(s) URLs (e.g. Runway outputs) are returned unchanged — already
 * in the cloud, nothing to upload.
 */

import { useAppStore } from '@/store/useAppStore';

let _warned = false;
function warnOnce(msg: string) {
  if (_warned) return;
  _warned = true;
  import('sonner').then(({ toast }) => toast.warning('Image kept on this device', { description: msg, duration: 9000 })).catch(() => {});
}

function settings(): any {
  try { return useAppStore.getState().settings || {}; } catch { return {}; }
}

interface MediaProviderConfig {
  cloudinaryCloudName?: string;
  cloudinaryUploadPreset?: string;
  githubMediaRepo?: string;   // "owner/repo" (PUBLIC repo)
  githubMediaToken?: string;  // token with public_repo (or repo) scope
}

function providerConfig(): MediaProviderConfig {
  const s = settings();
  return {
    cloudinaryCloudName: s.cloudinaryCloudName,
    cloudinaryUploadPreset: s.cloudinaryUploadPreset,
    githubMediaRepo: s.githubMediaRepo,
    // Reuse the gist token if a dedicated media token isn't set (works only if
    // that token happens to have repo scope; otherwise the GitHub path fails
    // and we fall through).
    githubMediaToken: s.githubMediaToken || s.githubGistToken,
  };
}

/** True when at least one cloud media host is configured. */
export function canUploadToCloud(): boolean {
  const c = providerConfig();
  return !!((c.cloudinaryCloudName && c.cloudinaryUploadPreset) || (c.githubMediaRepo && c.githubMediaToken));
}

/** Which provider is active (for UI copy). */
export function activeMediaProvider(): 'cloudinary' | 'github' | null {
  const c = providerConfig();
  if (c.cloudinaryCloudName && c.cloudinaryUploadPreset) return 'cloudinary';
  if (c.githubMediaRepo && c.githubMediaToken) return 'github';
  return null;
}

export function isHostedUrl(v: string | null | undefined): boolean {
  return typeof v === 'string' && /^https?:\/\//i.test(v);
}
function isDataUrl(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith('data:');
}

function rand(): string {
  return Math.abs(Date.now() ^ Math.floor(Math.random() * 1e9)).toString(36);
}

function extFromMime(mime: string): string {
  if (!mime) return 'bin';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('png')) return 'png';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime') || mime.includes('mov')) return 'mov';
  if (mime.startsWith('video/')) return 'mp4';
  return 'bin';
}
function mimeFromDataUrl(d: string): string {
  return (/^data:([^;,]+)/.exec(d)?.[1]) || 'image/png';
}

/* ───────────────── Cloudinary ───────────────── */

async function cloudinaryUpload(fileOrDataUrl: File | Blob | string, cloudName: string, preset: string): Promise<string> {
  const form = new FormData();
  // Cloudinary accepts a File/Blob OR a data-URI string as `file`.
  form.append('file', fileOrDataUrl as any);
  form.append('upload_preset', preset);
  // `auto` handles both image and video.
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`Cloudinary ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  const url = j.secure_url || j.url;
  if (!url) throw new Error('Cloudinary returned no URL');
  return url as string;
}

/* ───────────────── GitHub public repo → jsDelivr ───────────────── */

async function githubRepoUpload(base64NoPrefix: string, ext: string, repo: string, token: string, storyId: string): Promise<string> {
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error('githubMediaRepo must be "owner/repo"');
  const path = `media/${storyId || 'misc'}/${Date.now()}-${rand()}.${ext}`;
  const r = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}`, {
    method: 'PUT',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ message: `kindling media ${path}`, content: base64NoPrefix }),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  const branch = j.content?.url?.match(/ref=([^&]+)/)?.[1] || 'main';
  // jsDelivr CDN serves the file with the right content-type + caching, and
  // works in <img>/<video> and Runway. (raw.githubusercontent also works for
  // public repos, but jsDelivr is faster + cached.)
  return `https://cdn.jsdelivr.net/gh/${owner}/${name}@${branch}/${path}`;
}

async function blobToBase64NoPrefix(file: File | Blob): Promise<{ b64: string; mime: string }> {
  const dataUrl = await blobToDataUrl(file);
  return { b64: dataUrl.split(',')[1] || '', mime: mimeFromDataUrl(dataUrl) };
}

/* ───────────────── Public API ───────────────── */

export async function uploadFileToCloud(file: File | Blob, storyId: string): Promise<string> {
  const c = providerConfig();
  // 1) Cloudinary
  if (c.cloudinaryCloudName && c.cloudinaryUploadPreset) {
    try { return await cloudinaryUpload(file, c.cloudinaryCloudName, c.cloudinaryUploadPreset); }
    catch (e: any) { console.warn('[Kindling] Cloudinary upload failed:', e?.message || e); }
  }
  // 2) GitHub public repo
  if (c.githubMediaRepo && c.githubMediaToken) {
    try {
      const { b64, mime } = await blobToBase64NoPrefix(file);
      return await githubRepoUpload(b64, extFromMime(mime || (file as File).type), c.githubMediaRepo, c.githubMediaToken, storyId);
    } catch (e: any) { console.warn('[Kindling] GitHub media upload failed:', e?.message || e); }
  }
  // 3) Local fallback
  warnOnce('No free cloud media host is set up yet. Add Cloudinary (or a GitHub media repo) in Settings → Cloud to store images in the cloud.');
  return await blobToDataUrl(file);
}

export async function uploadDataUrlToCloud(value: string, storyId: string): Promise<string> {
  if (!value || isHostedUrl(value)) return value;
  if (!isDataUrl(value)) return value;
  const c = providerConfig();
  if (c.cloudinaryCloudName && c.cloudinaryUploadPreset) {
    try { return await cloudinaryUpload(value, c.cloudinaryCloudName, c.cloudinaryUploadPreset); }
    catch (e: any) { console.warn('[Kindling] Cloudinary upload (data url) failed:', e?.message || e); }
  }
  if (c.githubMediaRepo && c.githubMediaToken) {
    try {
      const b64 = value.split(',')[1] || '';
      return await githubRepoUpload(b64, extFromMime(mimeFromDataUrl(value)), c.githubMediaRepo, c.githubMediaToken, storyId);
    } catch (e: any) { console.warn('[Kindling] GitHub media upload (data url) failed:', e?.message || e); }
  }
  warnOnce('No free cloud media host is set up yet. Add Cloudinary (or a GitHub media repo) in Settings → Cloud.');
  return value;
}

/** Quick connectivity test for Settings. */
export async function testMediaProvider(): Promise<{ ok: boolean; provider?: string; error?: string }> {
  const c = providerConfig();
  // 1x1 transparent PNG.
  const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  if (c.cloudinaryCloudName && c.cloudinaryUploadPreset) {
    try { const u = await cloudinaryUpload(px, c.cloudinaryCloudName, c.cloudinaryUploadPreset); return { ok: isHostedUrl(u), provider: 'Cloudinary' }; }
    catch (e: any) { return { ok: false, provider: 'Cloudinary', error: e?.message || 'failed' }; }
  }
  if (c.githubMediaRepo && c.githubMediaToken) {
    try { const u = await githubRepoUpload(px.split(',')[1], 'png', c.githubMediaRepo, c.githubMediaToken, 'test'); return { ok: isHostedUrl(u), provider: 'GitHub' }; }
    catch (e: any) { return { ok: false, provider: 'GitHub', error: e?.message || 'failed' }; }
  }
  return { ok: false, error: 'No media host configured' };
}

/**
 * Migrate ONE story's inline base64 images to the cloud, replacing each with
 * its hosted URL, then persist the (now tiny) snapshot. One story at a time.
 */
export async function migrateStoryImagesToCloud(storyId: string): Promise<{ moved: number; failed: number; bytesMoved: number }> {
  if (!canUploadToCloud()) return { moved: 0, failed: 0, bytesMoved: 0 };
  const { getStateRecord, putStateRecord } = await import('@/lib/idbAdmin');
  const state: any = await getStateRecord(storyId);
  if (!state) return { moved: 0, failed: 0, bytesMoved: 0 };

  let moved = 0, failed = 0, bytesMoved = 0;
  const up = async (v: any): Promise<any> => {
    if (!isDataUrl(v)) return v;
    const len = (v as string).length;
    const url = await uploadDataUrlToCloud(v, storyId);
    if (isHostedUrl(url)) { moved += 1; bytesMoved += len; return url; }
    failed += 1; return v;
  };

  if (state.screenplay && Array.isArray(state.screenplay.assets)) {
    for (const a of state.screenplay.assets) if (isDataUrl(a?.data)) a.data = await up(a.data);
  }
  if (state.shots && typeof state.shots === 'object') {
    for (const k of Object.keys(state.shots)) {
      const sh = state.shots[k];
      if (isDataUrl(sh?.storyboard)) sh.storyboard = await up(sh.storyboard);
      if (isDataUrl(sh?.lastFrame)) sh.lastFrame = await up(sh.lastFrame);
      if (isDataUrl(sh?.audioFile)) sh.audioFile = await up(sh.audioFile);
    }
  }
  if (Array.isArray(state.characters)) {
    for (const c of state.characters) if (isDataUrl(c?.image)) c.image = await up(c.image);
  }
  if (state.bRolls && typeof state.bRolls === 'object') {
    for (const k of Object.keys(state.bRolls)) {
      const b = state.bRolls[k];
      if (isDataUrl(b?.frame)) b.frame = await up(b.frame);
    }
  }

  if (moved > 0) await putStateRecord(storyId, state);
  return { moved, failed, bytesMoved };
}

function blobToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

export function currentStoryId(): string {
  try { return useAppStore.getState().activeStoryId || 'misc'; } catch { return 'misc'; }
}
