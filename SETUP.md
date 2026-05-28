# Kindling – Deployment Guide

**Kindling** is now ready to deploy! Follow these steps to make it live on the web so you and your collaborators can work together in real-time.

---

## Part 1: Firebase Setup (5 min)

Kindling uses **Firebase** for real-time collaboration, authentication, and cloud storage. It's free and requires no credit card for typical hobby use.

### 1.1 Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"** and name it `kindling` (or your preferred name)
3. Enable Google Analytics (optional)
4. Click **"Create project"** and wait for it to initialize

### 1.2 Enable Firebase Services

Once your project is ready:

1. **Authentication**
   - Left sidebar → **Authentication**
   - Click **"Get started"**
   - Enable these sign-in methods:
     - ✓ Google (enable via the toggle)
     - ✓ Email/Password (enable via the toggle)
   - Save

2. **Firestore Database**
   - Left sidebar → **Build** → **Firestore Database**
   - Click **"Create database"**
   - Select **"Start in production mode"** (we'll add rules in a moment)
   - Choose a region closest to you
   - Click **"Create"**

3. **Storage**
   - Left sidebar → **Build** → **Storage**
   - Click **"Get started"**
   - Select **"Start in production mode"** → **"Next"**
   - Use default bucket location → **"Done"**

### 1.3 Add Security Rules

1. **Firestore Rules**
   - Go to **Firestore Database** → **Rules** tab
   - Replace all content with this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Profiles: anyone can read, users can write their own
    match /profiles/{userId} {
      allow read: if true;
      allow write: if request.auth.uid == userId;
    }

    // User stories: only owner can read/write
    match /users/{userId}/stories/{document=**} {
      allow read, write: if request.auth.uid == userId;
    }

    // User history: only owner
    match /users/{userId}/history/{document=**} {
      allow read, write: if request.auth.uid == userId;
    }

    // Rooms: collaborators can access their room's subcollections
    match /rooms/{roomId} {
      allow read: if true;
      allow write: if false;
      
      match /chat/{document=**} {
        allow read, write: if true;
      }
      match /presence/{document=**} {
        allow read, write: if true;
      }
      match /calls/{document=**} {
        allow read, write: if true;
      }
      match /accessRequests/{document=**} {
        allow read, write: if true;
      }
    }
  }
}
```

   - Click **"Publish"**

2. **Storage Rules**
   - Go to **Storage** → **Rules** tab
   - Replace all content with this:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

   - Click **"Publish"**

### 1.4 Get Your Firebase Config

1. Go to **Project Settings** (gear icon, top left)
2. Under **"Your apps"**, click the **"Web"** icon `</>`
3. Name it `kindling`
4. A config object will appear. Copy these **six values**:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

Keep this tab open—you'll need these values in the next step.

---

## Part 2: Deploy to Vercel (5 min)

**Vercel** hosts your app for free with automatic deployments.

### 2.1 Push Code to GitHub

1. Install [Git](https://git-scm.com) if needed
2. Initialize a repo in your project folder:

```bash
cd "path/to/Kimi_Agent_Screenwriter Pro Theme (1)"
git init
git add .
git commit -m "Initial commit: Kindling screenplay app"
```

3. Create a GitHub account (if you don't have one)
4. Create a new **empty** public repository named `kindling`
5. Push your code:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/kindling.git
git push -u origin main
```

### 2.2 Deploy to Vercel

1. Go to [Vercel](https://vercel.com)
2. Sign in with GitHub
3. Click **"Add New…"** → **"Project"**
4. Select your `kindling` repository
5. In **Environment Variables**, add these six from your Firebase config:

```
VITE_FIREBASE_API_KEY=<your_apiKey>
VITE_FIREBASE_AUTH_DOMAIN=<your_authDomain>
VITE_FIREBASE_PROJECT_ID=<your_projectId>
VITE_FIREBASE_STORAGE_BUCKET=<your_storageBucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<your_messagingSenderId>
VITE_FIREBASE_APP_ID=<your_appId>
```

6. Click **"Deploy"**
7. Wait ~2–3 minutes. You'll get a URL like `https://kindling-abc123.vercel.app`

**That's your app!** Share this URL with collaborators.

---

## Part 3: Local Development (Optional)

To keep developing locally while syncing to Firebase:

### 3.1 Create .env.local

In your project root (`Kimi_Agent_Screenwriter Pro Theme (1)/`), create `.env.local`:

```
VITE_FIREBASE_API_KEY=<your_apiKey>
VITE_FIREBASE_AUTH_DOMAIN=<your_authDomain>
VITE_FIREBASE_PROJECT_ID=<your_projectId>
VITE_FIREBASE_STORAGE_BUCKET=<your_storageBucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<your_messagingSenderId>
VITE_FIREBASE_APP_ID=<your_appId>
```

### 3.2 Run Locally

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Part 4: First Time Setup

1. **Sign in** to your Vercel URL
   - Sign up with Google or Email
   - Complete your profile (name, role, avatar)

2. **Create a story**
   - Click **"New Story"** in the Workspace
   - Add a title and type

3. **Invite collaborators**
   - Open the story
   - Go to **Collab** panel (right side)
   - Click **"Invite"** tab
   - Copy the invite link and share via email/Slack

---

## Troubleshooting

### I see "Firebase not configured" when testing calls
- Did you add the `.env` variables to Vercel? Re-deploy after adding them: in Vercel project settings, click **"Deployments"** → **"Redeploy"**.

### Video/audio calls aren't working
- Ensure you've enabled **Authentication** and **Firestore** in Firebase
- Check your security rules are applied (Firestore → Rules tab)
- Verify both users are signed in (not anonymous)

### I can't import my screenplay
- Ensure the file is `.json`, `.txt`, `.md`, or `.fountain` format
- Check file size (keep under 10 MB)

### Collaboration isn't syncing
- Make sure **both users** are signed in with valid Firebase auth
- Check that you're in the **same story** (active story ID must match)
- Verify Firestore database is in **production mode** (not test mode, which expires)

---

## Next Steps

- **Customize colors** in Settings (gear icon)
- **Add more collaborators** via Invite tab
- **Enable cloud sync** in Settings → Cloud Sync toggle (auto-saves to Firebase)
- **Set up AI helper** in Settings → paste your OpenAI API key (stored in browser only)

---

## Support & Resources

- **Firebase Docs**: https://firebase.google.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Report issues**: Open an issue on GitHub

---

**Happy screenwriting!** 🎬✨
