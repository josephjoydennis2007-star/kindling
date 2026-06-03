# Kindling Runway Bridge — install in 4 steps

This extension is a one-click bridge between Kindling and your Runway
web account. It uses **your existing Runway login** — including the
Unlimited Explore plan — so generations don't burn API credits. It is
a paste-and-relay tool, not an automation tool: **you always click
Generate yourself in Runway.**

## What it does

- In Kindling, on any storyboard tile, click the **Image** or **Video** button.
- The extension focuses your Runway tab (or opens one) and pastes
  the shot's prompt into Runway's prompt field.
- You click **Generate** in Runway. Your subscription handles it.
- When the result is ready, paste its URL into the small "Send to
  Kindling" popup the extension shows in the corner of Runway.
- The URL lands on the matching shot's storyboard slot in Kindling.

No automation of Runway controls. No credentials stored or
transmitted. The extension only sees what you ask it to send.

## Install in Chrome / Edge / Brave

1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
2. Enable **Developer mode** (toggle in the top-right).
3. Click **Load unpacked**.
4. Choose the `extension/` folder of this repo. Done.

Reload Kindling. The extension's content script will announce itself
to the page — when you click **Image** or **Video** on a shot, you'll
see "Sent to Runway" instead of the clipboard-fallback message.

## Uninstall

Same page (`chrome://extensions`), click **Remove** on the Kindling
Runway Bridge card.

## File layout

```
extension/
  manifest.json          — Manifest V3 spec
  background.js          — service worker, cross-tab routing
  content-kindling.js    — runs on kindling-1d29d.web.app
  content-runway.js      — runs on app.runwayml.com, pastes prompts
  README.md              — this file
```

## Privacy

- The extension never sees your password.
- It does not call any remote server.
- It only forwards messages between two tabs YOU are signed into.
- The repo's full source is in this folder — read it before installing.
