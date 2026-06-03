/**
 * Runway CORS proxy — a Cloudflare Worker.
 *
 * Why this exists
 * ---------------
 * Runway's Developer API at https://api.dev.runwayml.com does NOT
 * currently send Access-Control-Allow-Origin headers, which means a
 * web browser refuses any direct call to it. The browser fetch fails
 * before reaching Runway's auth layer, so the user sees "rejected the
 * key" even when their key is perfectly valid.
 *
 * This Worker is a thin pass-through. Kindling sends Runway requests
 * to your Worker URL, the Worker forwards them to Runway with the
 * exact same path + headers + body, then echoes Runway's response
 * back with CORS headers added so the browser will accept it. Your
 * API key is in the Authorization header that the browser sends and
 * the Worker just passes through — it isn't stored anywhere.
 *
 * Deploy in 5 steps (~5 minutes, no credit card needed)
 * -----------------------------------------------------
 *   1. Sign up at https://dash.cloudflare.com/sign-up (free)
 *   2. Left sidebar → "Workers & Pages" → "Create" → "Create Worker"
 *   3. Name it something like "kindling-runway" → Deploy (with the
 *      default Hello World code — we'll replace it next).
 *   4. Click "Edit code" on the new Worker. Delete everything in
 *      worker.js and paste the contents of this file. Click "Deploy".
 *   5. Copy the Worker URL — looks like
 *        https://kindling-runway.<your-cf-name>.workers.dev
 *      In Kindling: Settings → AI → Runway → Proxy URL → paste it.
 *      Click "Test connection" — should say "Runway key works".
 *
 * Cloudflare's free tier gives 100,000 Worker requests per day. A
 * full feature-length agent run with Runway image generation uses
 * maybe 30 requests, so the free tier is effectively unlimited for
 * this use case.
 *
 * Security note
 * -------------
 * The proxy doesn't store or log your API key. But anyone who
 * discovers your Worker URL can use it to make Runway calls (which
 * will fail without their own valid key, since the key still has to
 * be passed in the Authorization header). To lock it down further
 * you can add an origin check — uncomment the block marked
 * `// ORIGIN LOCK` below and replace `https://kindling-1d29d.web.app`
 * with your actual app URL.
 */

const RUNWAY_ORIGIN = 'https://api.dev.runwayml.com';

// CORS headers — pass everything Runway accepts back to the browser.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-runway-version',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    // Preflight — browser asks "am I allowed to talk to you?".
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ORIGIN LOCK — uncomment + edit to restrict to your app only.
    // const allowed = 'https://kindling-1d29d.web.app';
    // const origin = request.headers.get('Origin');
    // if (origin && origin !== allowed) {
    //   return new Response('Forbidden', { status: 403, headers: CORS_HEADERS });
    // }

    // Build the target Runway URL from the incoming path + query.
    const incoming = new URL(request.url);
    const target = `${RUNWAY_ORIGIN}${incoming.pathname}${incoming.search}`;

    // Forward the request as-is. We strip 'Host' so fetch can reset
    // it to api.dev.runwayml.com; everything else (Authorization,
    // X-Runway-Version, Content-Type) passes through.
    const forwarded = new Request(target, {
      method: request.method,
      headers: scrubHeaders(request.headers),
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : undefined,
      redirect: 'follow',
    });

    let runwayResponse;
    try {
      runwayResponse = await fetch(forwarded);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'proxy_failed', detail: String(e?.message || e) }),
        { status: 502, headers: { 'content-type': 'application/json', ...CORS_HEADERS } },
      );
    }

    // Echo Runway's response back to the browser with CORS headers.
    const respHeaders = new Headers(runwayResponse.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) respHeaders.set(k, v);

    return new Response(runwayResponse.body, {
      status: runwayResponse.status,
      statusText: runwayResponse.statusText,
      headers: respHeaders,
    });
  },
};

function scrubHeaders(headers) {
  const out = new Headers();
  for (const [k, v] of headers.entries()) {
    const lk = k.toLowerCase();
    // Drop hop-by-hop + browser headers that fetch will set itself.
    if (lk === 'host' || lk === 'connection' || lk === 'content-length' || lk === 'origin' || lk === 'referer') continue;
    out.set(k, v);
  }
  return out;
}
