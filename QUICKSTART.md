# 🎬 Kindling - Screenplay Collaboration Studio

**Your all-in-one platform for writers and directors to collaborate in real-time.**

---

## ✨ What's New

### Just Completed:
- ✅ **Coworker Access Request System** - Admins can approve/deny collaborator access
- ✅ **Floating Action Buttons** - Quick access to add notes, characters, beats (bottom right)
- ✅ **Improved Navigation** - Better spacing & visual hierarchy for Writer/Director/Plot/Workspace tabs
- ✅ **Firebase Real-time Sync** - Cloud storage, authentication, presence tracking
- ✅ **WebRTC Video/Audio** - P2P calls via Firebase signaling
- ✅ **Full Auth System** - Google & Email/Password sign-in
- ✅ **Production Build** - Optimized and ready to deploy

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
cd "Kimi_Agent_Screenwriter Pro Theme (1)/app"
npm install
```

### 2. Run Locally
```bash
npm run dev
```
Visit: **http://localhost:5173**

### 3. Test Locally
- Sign up locally (anonymous or create an account)
- Create a story
- Test Writer/Director/Plot views
- Try the **floating action button** (bottom right) to add notes/characters
- Open Collab panel to see the new access requests system

---

## 🌐 Deploy to Vercel (5 Minutes)

### Option 1: GitHub + Vercel (Recommended)

#### Step 1: Push to GitHub
1. Go to **https://github.com/new**
2. Create a new repository called `kindling` (public)
3. Follow the instructions to push your code:

```bash
cd "Kimi_Agent_Screenwriter Pro Theme (1)"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/kindling.git
git push -u origin main
```

#### Step 2: Connect to Vercel
1. Go to **https://vercel.com/new**
2. Click **"Add New Project"**
3. Select your `kindling` repository
4. Click **"Import"**

#### Step 3: Add Environment Variables
In the **Environment Variables** section, add these 6 variables from your Firebase project:

```
VITE_FIREBASE_API_KEY=YOUR_VALUE
VITE_FIREBASE_AUTH_DOMAIN=YOUR_VALUE
VITE_FIREBASE_PROJECT_ID=YOUR_VALUE
VITE_FIREBASE_STORAGE_BUCKET=YOUR_VALUE
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_VALUE
VITE_FIREBASE_APP_ID=YOUR_VALUE
```

Get these values from:
- Firebase Console → Project Settings (gear icon)
- Your web app configuration

#### Step 4: Deploy
Click **"Deploy"** and wait 2-3 minutes. You'll get a URL like:
```
https://kindling-abc123.vercel.app
```

**That's your live app!** 🎉

---

### Option 2: Deploy Without Firebase (Local-Only Demo)

```bash
npm run build
npm run preview
```

Visit: **http://localhost:4173**

---

## 📚 File Organization

```
Kindling/
├── SETUP.md                    ← Detailed Firebase + Vercel setup
├── app/
│   ├── src/
│   │   ├── App.tsx             ← Main app + floating buttons
│   │   ├── components/
│   │   │   ├── Sidebar.tsx      ← Navigation (Writer/Director/Plot/Workspace)
│   │   │   ├── WriterView.tsx   ← Screenplay editor with Tiptap
│   │   │   ├── DirectorView.tsx ← Scene planning & shot management
│   │   │   ├── PlotBoardView.tsx ← Beat board & story structure
│   │   │   ├── CollabPanel.tsx  ← NEW: Coworker requests tab
│   │   │   ├── FloatingActionButton.tsx ← NEW: Quick actions
│   │   │   ├── AuthWall.tsx     ← Google/Email sign-in
│   │   │   ├── ProfileEditor.tsx ← User profile setup
│   │   │   └── ...
│   │   ├── firebase.ts         ← Backend integration
│   │   ├── lib/rtcCall.ts      ← Video/audio P2P
│   │   └── store/              ← State management
│   ├── package.json
│   └── vite.config.ts
└── .git/                       ← Already initialized
```

---

## 🎯 Key Features

### Writer Section
- Rich text editor with Tiptap
- Format buttons (Scene, Action, Character, Dialogue, etc.)
- Color & highlight pickers
- Page management with preview
- Character mentions

### Director Section
- Scene planning board
- Shot types & camera notes
- B-roll management
- Color-coded status tracking

### Collaboration
- Real-time chat
- User presence tracking
- **NEW: Access request system** (admin approves collaborators)
- Voice & video calls (with Firebase setup)
- Share via link or email

### Workspace
- Cloud storage links (Drive, Box, etc.)
- Multiple export formats
- Import from various file types
- Story history & versions

---

## 🔧 Features to Explore

**Floating Action Button** (bottom right - globe icon):
- Add Note
- New Character
- Add Beat

**Collab Panel**:
- **NEW "Requests" tab** (admin only) - manage access requests
- Chat with collaborators
- Invite via link or manually

**Settings** (⚙️):
- Theme (dark/light/custom)
- Color customization
- Auto-save settings
- Cloud sync toggle

---

##⚡ Firebase First-Time Setup

If you haven't set up Firebase yet:
1. Read **SETUP.md** for step-by-step Firebase configuration
2. Get your 6 Firebase env vars
3. Add them to Vercel
4. Redeploy

For more details: See **SETUP.md**

---

## 🐛 Troubleshooting

**"Firebase not configured"**
- Have you added Firebase env vars to `.env.local` (local) or Vercel (production)?
- Restart the dev server after adding vars

**Video/audio calls not working**
- Firebase must be configured (see above)
- Both users must be signed in (not anonymous)
- Check browser permissions for camera/microphone

**Can't import files**
- Supported formats: `.json`, `.txt`, `.md`, `.fountain`
- File size limit: 10 MB

**Collab features not working**
- Enable Firestore in your Firebase project
- Check security rules in SETUP.md are applied

---

## 📱 Responsive Design

Works on:
- ✅ Desktop (optimized)
- ✅ Tablet (portrait & landscape)
- ✅ Mobile (sidebar collapses)

---

##🎓 Next Steps

1. **Run locally**: `npm run dev`
2. **Set up Firebase** (see SETUP.md)
3. **Deploy to Vercel** (follow steps above)
4. **Invite collaborators** via the Collab panel invite link
5. **Iterate & customize** colors/settings

---

## 📞 Support

- **Local dev issues**: Check `.env.local` variables
- **Vercel issues**: Check environment variables in Vercel dashboard
- **Firebase issues**: See SETUP.md Troubleshooting section

---

**Happy screenwriting!** 🎬✨

*Made with ❤️ using React, TypeScript, Firebase, Vite, and Tailwind CSS*
