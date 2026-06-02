# Kindling Studio

A professional screenwriting + director studio for solo creators and collaborative teams.

**Live app:** [kindling-1d29d.web.app](https://kindling-1d29d.web.app)

---

## What it does

Three workspaces, one story:

- **Writer** — TipTap-based screenplay editor with industry formats (Scene Heading, Action, Character, Parenthetical, Dialogue, Transition), sections, pages, character profiles, find & replace, AI assistance, and inline rewrite.
- **Director** — Scene-by-scene shot lists, b-roll, storyboards, scene heat map, character relationship graph, production reports (shot list, cast, locations), production calendar with clash detection, and a budget tracker.
- **Plot** — Acts + beats board with drag reorder, beat-type categories, Save the Cat / Hero's Journey templates.

Per-type templates for **feature films, TV series, mini series, documentaries, short films, music videos, commercials, YouTube content, web series, stage plays, and animation**.

---

## Collaboration

Built-in multi-user, role-based:

- **Four roles**: Writer, Director, Producer, Both
  - Writers edit the script, see the boards read-only
  - Directors edit the boards, see the script read-only
  - Producers view everything, only comment (no edits)
  - Both = full creative editor
- **Real-time chat** + **real-time comments** on every story
- **Inline comments** with three entry points: TopBar button, `Ctrl+Shift+M`, or right-click on selected text — popup floats next to your selection and is draggable within the workspace
- **Persistent highlight overlay** on commented snippets; double-click a highlight to edit
- **Invite by email** with role-aware preview (shows what role the invitee signed up as before you send)
- **Friends list** for quick re-invites
- **Ownership transfer** + **per-collaborator role change** for story owners
- **Video / voice calls** via Jitsi Meet rooms keyed per story (free, no signup)
- **Notification badges** on the Tools button for pending invites + unread comments

---

## AI features

- Streaming AI Helper (Anthropic / OpenAI / custom endpoint)
- Dialogue Coach — get notes on any line, replace inline
- Style Assistant — passive voice, repeats, sentence-length feedback
- Script Doctor — pacing, weak hooks, structural imbalance
- AI scene breakdown — characters, props, locations, mood
- "What if?" alternate takes
- Per-character AI bio generation
- Inline rewrite-in-place

---

## Output

- **Export**: PDF, DOCX, Fountain, Final Draft (.fdx), plain text
- **Import**: Fountain, FDX, Markdown, HTML, JSON
- **Cloud sync backends**: Firebase (default), GitHub Gist, JSONBin, Dropbox, Supabase, WebDAV, Pastebin
- **Offline**: PWA + IndexedDB local cache — works without internet

---

## Tech stack

- React 19 + TypeScript + Vite
- Tailwind CSS + custom theme tokens (Indigo Dusk, Sunset Salmon, Forest Calm, Violet Theatre palettes)
- Zustand for state + persist middleware
- TipTap (ProseMirror) for the writer editor
- Framer Motion for transitions
- Firebase (Auth, Firestore, Hosting)
- i18n: English, Spanish, French
- WCAG 2.1 AA audited

---

## Running locally

```bash
# 1. Clone + install
git clone <repo-url> kindling
cd kindling/app
npm install

# 2. Add your Firebase config
cp .env.example .env
# Edit .env with your VITE_FIREBASE_* keys (see SETUP.md for the 5-minute walkthrough)

# 3. Run
npm run dev
# → http://localhost:3000
```

---

## Deploying

```bash
# One-shot deploy to Firebase Hosting (also publishes Firestore rules):
npx firebase-tools deploy
```

`firebase.json` at the repo root wires the build → upload → publish flow. The predeploy hook runs `npm --prefix app run build`.

---

## Testing

```bash
cd app
npm run test:e2e          # Playwright smoke test (creates story, saves, asserts no console errors)
npm run test:e2e:ui       # interactive Playwright UI
```

---

## Project layout

```
.
├── app/                  # The React app
│   ├── src/
│   │   ├── components/   # UI (writer, director, plot, comments, collab…)
│   │   ├── lib/          # cloudStories, importers, exporters, AI, sync backends
│   │   ├── hooks/        # useIndexedDB, useStoryRole, useNotifications
│   │   ├── store/        # Zustand store
│   │   ├── types/        # Shared TS types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/           # SW, manifest, icons, reset.html
│   └── tests/            # Playwright smoke test
├── firestore.rules       # Firestore security rules
├── firebase.json         # Hosting + Firestore config
├── QUICKSTART.md         # 5-minute fresh-machine setup
└── SETUP.md              # Detailed Firebase setup walkthrough
```

---

## License

Private. All rights reserved.

---

## Status

**v1.0** — feature-complete for solo + collaborative use. Ongoing v1.1 work focuses on:

- Live multi-cursor co-editing (Yjs CRDT)
- Comment threading / replies
- Push notifications when offline
- Additional language translations
