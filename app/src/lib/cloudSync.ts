/**
 * Free cloud sync providers — push & pull the same JSON your local
 * `exportStory()` returns. No OAuth flow, just paste-a-token.
 *
 * Supported in this file:
 *   - GitHub Gist  (PAT, `gist` scope) — unlimited private gists, free
 *   - JSONBin.io   (Master Key)        — 10k requests/month free
 *
 * Each function returns { ok: true, ... } on success or
 * { ok: false, error: string } on failure. The caller surfaces toasts.
 */

const FILENAME = 'kindling-story.json';

type SyncResult<T = unknown> = { ok: true; data?: T; remoteId?: string } | { ok: false; error: string };

/* ---------------- GitHub Gist ---------------- */

export async function gistPush(token: string, json: string, existingId?: string): Promise<SyncResult> {
  if (!token) return { ok: false, error: 'GitHub PAT missing' };
  try {
    const body = {
      description: 'Kindling — story backup',
      public: false,
      files: { [FILENAME]: { content: json } },
    };
    const url = existingId
      ? `https://api.github.com/gists/${existingId}`
      : 'https://api.github.com/gists';
    const r = await fetch(url, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, error: `GitHub ${r.status}: ${(await r.text()).slice(0, 160)}` };
    const j = (await r.json()) as { id: string };
    return { ok: true, remoteId: j.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function gistPull(token: string, gistId: string): Promise<SyncResult<string>> {
  if (!token) return { ok: false, error: 'GitHub PAT missing' };
  if (!gistId) return { ok: false, error: 'No gist saved yet — push first' };
  try {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!r.ok) return { ok: false, error: `GitHub ${r.status}` };
    const j = (await r.json()) as { files?: Record<string, { content?: string }> };
    const content = j.files?.[FILENAME]?.content;
    if (!content) return { ok: false, error: 'Gist has no kindling-story.json file' };
    return { ok: true, data: content };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/* ---------------- JSONBin.io ---------------- */

export async function jsonbinPush(masterKey: string, json: string, existingBinId?: string): Promise<SyncResult> {
  if (!masterKey) return { ok: false, error: 'JSONBin master key missing' };
  try {
    const payload = JSON.parse(json); // JSONBin needs a real object
    const url = existingBinId
      ? `https://api.jsonbin.io/v3/b/${existingBinId}`
      : 'https://api.jsonbin.io/v3/b';
    const r = await fetch(url, {
      method: existingBinId ? 'PUT' : 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Master-Key': masterKey,
        'X-Bin-Name': 'kindling-story',
        'X-Bin-Private': 'true',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return { ok: false, error: `JSONBin ${r.status}: ${(await r.text()).slice(0, 160)}` };
    const j = await r.json();
    const id = j?.metadata?.id || existingBinId;
    return { ok: true, remoteId: id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function jsonbinPull(masterKey: string, binId: string): Promise<SyncResult<string>> {
  if (!masterKey) return { ok: false, error: 'JSONBin master key missing' };
  if (!binId) return { ok: false, error: 'No bin saved yet — push first' };
  try {
    const r = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { 'X-Master-Key': masterKey },
    });
    if (!r.ok) return { ok: false, error: `JSONBin ${r.status}` };
    const j = await r.json();
    return { ok: true, data: JSON.stringify(j?.record ?? {}) };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/* ---------------- Dropbox (Files API v2) ---------------- */
//
// Dropbox tokens are 4-hour OAuth tokens or long-lived "app access tokens"
// created in the Dropbox app console. We upload a JSON file to /kindling/
// using the content endpoint.

const DROPBOX_PATH = '/kindling-story.json';

export async function dropboxPush(token: string, json: string): Promise<SyncResult> {
  if (!token) return { ok: false, error: 'Dropbox token missing' };
  try {
    const r = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: DROPBOX_PATH,
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
      },
      body: json,
    });
    if (!r.ok) return { ok: false, error: `Dropbox ${r.status}: ${(await r.text()).slice(0, 160)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function dropboxPull(token: string): Promise<SyncResult<string>> {
  if (!token) return { ok: false, error: 'Dropbox token missing' };
  try {
    const r = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: DROPBOX_PATH }),
      },
    });
    if (!r.ok) return { ok: false, error: `Dropbox ${r.status}: ${(await r.text()).slice(0, 160)}` };
    return { ok: true, data: await r.text() };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/* ---------------- Supabase Storage ---------------- */
//
// Uses the Supabase Storage REST API with the project's anon key. The user
// must have a bucket named "kindling" with public/anon insert+select rights
// (or a service-role key — but never put that in a client app).

const SUPABASE_BUCKET = 'kindling';
const SUPABASE_OBJECT = 'story.json';

export async function supabasePush(projectUrl: string, anonKey: string, json: string): Promise<SyncResult> {
  if (!projectUrl) return { ok: false, error: 'Supabase URL missing' };
  if (!anonKey) return { ok: false, error: 'Supabase anon key missing' };
  try {
    const base = projectUrl.replace(/\/$/, '');
    const url = `${base}/storage/v1/object/${SUPABASE_BUCKET}/${SUPABASE_OBJECT}`;
    // Try PUT (update); fall back to POST if it doesn't exist yet.
    const tryUpload = async (method: 'PUT' | 'POST') => {
      return fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          'content-type': 'application/json',
          'x-upsert': 'true',
        },
        body: json,
      });
    };
    let r = await tryUpload('PUT');
    if (!r.ok && (r.status === 404 || r.status === 400)) r = await tryUpload('POST');
    if (!r.ok) return { ok: false, error: `Supabase ${r.status}: ${(await r.text()).slice(0, 160)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function supabasePull(projectUrl: string, anonKey: string): Promise<SyncResult<string>> {
  if (!projectUrl) return { ok: false, error: 'Supabase URL missing' };
  if (!anonKey) return { ok: false, error: 'Supabase anon key missing' };
  try {
    const base = projectUrl.replace(/\/$/, '');
    const url = `${base}/storage/v1/object/public/${SUPABASE_BUCKET}/${SUPABASE_OBJECT}`;
    const r = await fetch(url, {
      headers: { authorization: `Bearer ${anonKey}`, apikey: anonKey },
    });
    if (!r.ok) return { ok: false, error: `Supabase ${r.status}: ${(await r.text()).slice(0, 160)}` };
    return { ok: true, data: await r.text() };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/* ---------------- WebDAV (Nextcloud / Owncloud / mailbox.org) ---------------- */
//
// WebDAV PUT uploads the JSON file at the given URL; GET reads it back.
// Auth is HTTP Basic ("user:password" → base64). Servers vary in CORS — many
// require a CORS allow-list config; the user picks one that supports it.

const WEBDAV_FILE = 'kindling-story.json';

function basicAuthHeader(userPass: string): string {
  // Tolerate the user pasting `user:password` or just `token`.
  const raw = userPass.includes(':') ? userPass : `${userPass}:`;
  return `Basic ${btoa(raw)}`;
}

export async function webdavPush(baseUrl: string, userPass: string, json: string): Promise<SyncResult> {
  if (!baseUrl) return { ok: false, error: 'WebDAV URL missing' };
  if (!userPass) return { ok: false, error: 'WebDAV credentials missing' };
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/${WEBDAV_FILE}`;
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        authorization: basicAuthHeader(userPass),
        'content-type': 'application/json',
      },
      body: json,
    });
    if (!r.ok) return { ok: false, error: `WebDAV ${r.status}: ${(await r.text()).slice(0, 160)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network / CORS error' };
  }
}

export async function webdavPull(baseUrl: string, userPass: string): Promise<SyncResult<string>> {
  if (!baseUrl) return { ok: false, error: 'WebDAV URL missing' };
  if (!userPass) return { ok: false, error: 'WebDAV credentials missing' };
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/${WEBDAV_FILE}`;
    const r = await fetch(url, { headers: { authorization: basicAuthHeader(userPass) } });
    if (!r.ok) return { ok: false, error: `WebDAV ${r.status}` };
    return { ok: true, data: await r.text() };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network / CORS error' };
  }
}

/* ---------------- Pastebin (one-way share) ---------------- */
//
// Pastebin is one-way: there's no useful "pull" without an auth token flow
// they no longer hand out. We surface only push, returning the new paste URL
// so the user can share it.

export async function pastebinPush(devKey: string, json: string): Promise<SyncResult & { url?: string }> {
  if (!devKey) return { ok: false, error: 'Pastebin dev API key missing' };
  try {
    const body = new URLSearchParams({
      api_dev_key: devKey,
      api_option: 'paste',
      api_paste_code: json,
      api_paste_name: 'kindling-story.json',
      api_paste_format: 'json',
      api_paste_private: '1', // unlisted
      api_paste_expire_date: 'N', // never
    });
    const r = await fetch('https://pastebin.com/api/api_post.php', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const text = await r.text();
    if (!r.ok || text.startsWith('Bad API request')) {
      return { ok: false, error: text.slice(0, 160) };
    }
    return { ok: true, url: text.trim() };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

/* ---------------- Online detection ---------------- */

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
}
