# Kindling Connector — control your app from Claude (desktop + web + phone)

This turns Kindling into a **custom connector for Claude** — exactly like the
Runway connector. Once it's set up, you open Claude (on your computer **or
your phone**), say *"build me a 6‑episode sci‑fi series about X,"* and Claude
writes the whole thing — characters, acts, scenes, screenplay — straight into
**your** Kindling account. Open the app and it's all there.

It's a tiny Cloudflare Worker (free) that signs in to your Kindling account
and writes the story to your cloud. No data passes through anyone else.

---

## What you need (one‑time)

1. A **free Cloudflare account** → https://dash.cloudflare.com/sign-up
2. **Node.js** installed → https://nodejs.org (LTS)
3. An **email + password** login on your Kindling account (see Step 1 — Google
   sign‑in alone can't be automated, so you add a password).

---

## Step 1 — Put an email/password on your Kindling account

The connector signs in as you, so it needs an **email + password** login.

- If you already sign in to Kindling with **email + password** → you're set.
- If you only use **Google sign‑in**: create a separate **email + password**
  Kindling account (any email you control) and use the connector with that.
  Claude's stories will live in **that** account, so just sign into the app
  with the same email/password to see them.
- Want Claude's stories in your existing **Google** account instead? That needs
  a "link a password to my Google login" button in the app — ask and I'll add
  it (Firebase supports it; it's a small change).

Remember the email + password you choose — you'll paste them in Step 3.

---

## Step 2 — Deploy the Worker

Open a terminal in this `kindling-connector` folder and run:

```bash
npm install -g wrangler        # one time
wrangler login                 # opens your browser to authorize Cloudflare
wrangler deploy                # publishes the Worker
```

`wrangler deploy` prints your Worker URL, e.g.
`https://kindling-connector.YOURNAME.workers.dev` — **copy it.**

---

## Step 3 — Give it your Kindling login (kept secret on Cloudflare)

```bash
wrangler secret put KINDLING_EMAIL
# paste your Kindling email, press Enter

wrangler secret put KINDLING_PASSWORD
# paste your Kindling password, press Enter
```

These are stored encrypted on Cloudflare — they are **not** in the code or in
git. Re‑deploy isn't needed; secrets apply immediately.

Test it's live: open the Worker URL in a browser — you should see
*"Kindling Connector is running."*

---

## Step 4 — Add it to Claude

### On the Claude desktop app / web (claude.ai)
1. **Settings → Connectors → Add custom connector**.
2. Paste your Worker URL.
3. Save. Claude will discover the tools (`build_story`, `list_stories`).

### On your phone
The same custom connector you added on claude.ai is available in the Claude
mobile app once you're signed in to the same account — no separate setup.

> Custom connectors require a paid Claude plan (Pro/Max/Team). You already
> have a Claude subscription, so you're covered.

---

## Step 5 — Use it

In any Claude chat:

> *"Using Kindling, build me a neo‑noir detective movie called 'Ash & Neon' —
> give me a logline, 3 acts with beats, 5 characters with full profiles, a
> scene list with shots, and write the first 10 scenes of the screenplay."*

Claude calls `build_story`, the Worker writes it to your account, and you get a
link. **Open Kindling (refresh / make sure you're signed in)** and the story is
in your list — acts, characters, screenplay, scenes, all populated.

`list_stories` lets Claude see what you already have.

---

## Privacy & safety
- The Worker runs under **your** Cloudflare account and signs in as **you**.
  It can only read/write **your** Kindling stories.
- Your email/password live only as encrypted Cloudflare secrets.
- The Firebase API key in the code is the public Kindling web key (safe to
  ship — it's the same one the website uses).

## Troubleshooting
- **"sign-in failed"** → the account needs an email/password login (Step 1),
  and the email/password secrets must be correct (re‑run Step 3).
- **Claude won't add the connector** → make sure the URL opens in a browser and
  shows the "running" message; make sure you're on a paid Claude plan.
- **Story doesn't show in the app** → fully refresh Kindling and confirm you're
  signed in with the SAME account whose email/password you gave the Worker.
