import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User as UserIcon, Loader2, Flame, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  isFirebaseConfigured,
  signInWithGoogle,
  signInEmail,
  signUpEmail,
  resetPassword,
  signInAnon,
} from '@/firebase';
import type { User } from 'firebase/auth';

interface Props {
  onSignedIn: (user: User | null, mode: 'firebase' | 'local') => void;
}

export default function AuthWall({ onSignedIn }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doGoogle = async () => {
    if (!isFirebaseConfigured) {
      toast.error('Firebase is not configured yet — see SETUP.md');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const u = await signInWithGoogle();
      if (u) onSignedIn(u, 'firebase');
    } catch (e: any) {
      setErr(humanError(e));
    } finally { setBusy(false); }
  };

  const doEmail = async () => {
    if (!isFirebaseConfigured) {
      toast.error('Firebase is not configured yet — see SETUP.md');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const u = mode === 'signin' ? await signInEmail(email, password) : await signUpEmail(email, password);
      onSignedIn(u, 'firebase');
    } catch (e: any) {
      setErr(humanError(e));
    } finally { setBusy(false); }
  };

  const doSkip = async () => {
    setBusy(true);
    const u = isFirebaseConfigured ? await signInAnon() : null;
    onSignedIn(u, 'local');
    setBusy(false);
  };

  const doReset = async () => {
    if (!email) { toast.error('Enter your email first'); return; }
    try { await resetPassword(email); toast.success('Reset email sent'); }
    catch (e: any) { setErr(humanError(e)); }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-orange-500/40"
          >
            <Flame className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold text-[var(--text)]">Kindling</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">A studio for writers &amp; directors</p>
        </div>

        <div className="bg-[var(--panel)]/80 backdrop-blur-xl border border-[var(--border)] rounded-2xl shadow-2xl p-6">
          <div className="flex gap-1 mb-4 p-1 bg-[var(--card)] rounded-lg">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                  mode === m ? 'bg-[var(--accent)] text-[var(--bg)] shadow' : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {/* Google */}
          <button
            disabled={busy}
            onClick={doGoogle}
            className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-all shadow disabled:opacity-50"
          >
            <GoogleSVG />
            Continue with Google
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)]" /></div>
            <div className="relative flex justify-center"><span className="px-2 text-[10px] uppercase tracking-widest bg-[var(--panel)] text-[var(--text-muted)]">or with email</span></div>
          </div>

          {/* Email + password */}
          <div className="space-y-2.5">
            <Field icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            <Field icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Password (min 8 chars)" />

            <AnimatePresence>
              {err && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 p-2 rounded-md bg-red-500/10 border border-red-500/30 text-[11px] text-red-400 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    {err}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              disabled={busy || !email || !password}
              onClick={doEmail}
              className="w-full mt-1 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-bold shadow hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>

            {mode === 'signin' && (
              <button onClick={doReset} className="w-full text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                Forgot password?
              </button>
            )}
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)]" /></div>
            <div className="relative flex justify-center"><span className="px-2 text-[10px] uppercase tracking-widest bg-[var(--panel)] text-[var(--text-muted)]">or</span></div>
          </div>

          <button
            disabled={busy}
            onClick={doSkip}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-all flex items-center justify-center gap-1.5"
          >
            <UserIcon className="w-3.5 h-3.5" />
            Continue without account (local-only)
          </button>

          {!isFirebaseConfigured && (
            <p className="mt-3 text-[10px] text-amber-400 text-center">
              Firebase isn't configured yet — sign-in is disabled until you add your config (see SETUP.md).
              Local-only works right now.
            </p>
          )}
        </div>

        <p className="text-center text-[10px] text-[var(--text-muted)] mt-4">
          By continuing you agree to use Kindling for the awesome stories you have in mind.
        </p>
      </motion.div>
    </div>
  );
}

function Field({ icon: Icon, type, value, onChange, placeholder }: { icon: any; type: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg focus-within:border-[var(--accent)] transition-all">
      <Icon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
      />
    </div>
  );
}

function GoogleSVG() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.13a6.6 6.6 0 0 1 0-4.26V7.03H2.18a11 11 0 0 0 0 9.94l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.03l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

function humanError(e: any): string {
  const code = e?.code || '';
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'That email already has an account — try Sign in instead.',
    'auth/invalid-email': 'That email looks invalid.',
    'auth/operation-not-allowed': 'This sign-in method isn\'t enabled in your Firebase console.',
    'auth/weak-password': 'Password should be at least 8 characters.',
    'auth/user-disabled': 'That account is disabled.',
    'auth/user-not-found': 'No account with that email.',
    'auth/wrong-password': 'Wrong password.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/network-request-failed': 'Network problem — check your connection.',
    'auth/popup-closed-by-user': 'Google popup was closed before sign-in finished.',
    'auth/unauthorized-domain': 'This domain isn\'t in Firebase\'s authorized list — add it under Authentication → Settings.',
  };
  return map[code] || e?.message || 'Something went wrong.';
}
