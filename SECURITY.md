# Kindling — Security Audit & Notes

_Last reviewed as part of the hardening pass (Task 9)._ This documents the
current security posture, what was hardened, and the items that need a one-time
infrastructure decision before they can be completed.

## Firestore rules — audit

Reviewed `firestore.rules`. Overall the model is sound: per-story access keyed
on `owner` + `collaborators`, public-read profiles for collaboration, and a
default-deny catch-all. Findings:

| Area | Status | Notes |
|------|--------|-------|
| `/stories/{id}` read | ✅ OK | owner / collaborator / `shareable`; `resource == null` read is the sanctioned "check-then-create" pattern (leaks only ID existence, not data). |
| `/stories/{id}` update | ✅ OK | 3 independent OR branches: owner / collaborator (cannot touch owner/collaborators/shareable/roles) / invite-backed self-join (role match prevents elevation). |
| `/stories/{id}/{comments,chat,versions}` | ✅ OK | membership-gated via `get()` on the parent story; chat/versions immutable (no update). |
| `/profiles/{uid}` | ✅ OK | public read (needed for collab names/avatars), write-own only. |
| `/profilesByEmail/{email}` | ✅ **Hardened** | previously any user could write a row for *any* email with their own uid, poisoning invite lookups. Now the doc id (email) must equal the caller's own verified email token. |
| `/presence/{uid}` | ✅ OK | read any, write-own. |
| catch-all | ✅ OK | `allow read, write: if false`. |

**Residual (accepted) risks:**
- `profilesByEmail` / `profiles` are enumerable by any signed-in user (needed
  for the invite-by-email UX). Low risk; consider a Cloud Function lookup later
  if email privacy becomes a concern.
- Rules can't enforce the 1 MB document size — handled client-side by the
  Task 3 size guard.

## AI keys — current exposure & the fix (needs your decision)

**Today:** user-supplied AI provider keys (Gemini/OpenAI/OpenRouter/etc.) are
stored in client settings and sent **directly from the browser** to the
provider. For a single user using *their own* key this is acceptable, but for a
multi-tenant/company product it means:
- keys can be read from the device,
- there's no central rate-limiting or spend cap,
- a shared/app-owned key could never be used safely client-side.

**Recommended fix — a server proxy (one-time setup required):**
1. Deploy a small Cloudflare Worker (same account as the existing
   `kindling-connector`) that holds the provider key as a Worker secret and
   forwards chat/completion requests.
2. Point the app's AI client at the proxy URL instead of the provider.
3. Enforce **per-user rate limits + a daily token budget** in the Worker.

This needs two decisions from the owner: (a) which provider key the app proxies,
and (b) confirmation to deploy the Worker + set its secret. Until then the
in-app "bring your own key" flow remains the supported path.

## Cost controls
- A lightweight client-side quota already exists for Gemini (`lib/geminiQuota.ts`).
- Full per-user metering belongs in the proxy above (server-authoritative).

## Deploying rules
```
firebase deploy --only firestore:rules
```
