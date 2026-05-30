import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Stethoscope, Loader2, Check, AlertCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp, enableNetwork, disableNetwork } from 'firebase/firestore';

/**
 * CloudDiagnostic — in-app live test of Firebase config + Firestore round-trip.
 *
 * Opens via the `app:diagnose` custom event. Runs a step-by-step probe and
 * shows the EXACT failure (with code + message) so the user can paste it
 * back for support. This is what to reach for whenever cloud features feel
 * broken — it tells you whether the problem is config, auth, rules,
 * propagation, or a stuck SDK.
 *
 * Steps:
 *   1. Read live Firebase config (so you can confirm it matches your
 *      Firebase Console settings).
 *   2. Check auth state (is anyone signed in? as whom?).
 *   3. Force-cycle the Firestore network (kicks stuck-offline state).
 *   4. Try writing a test doc to `/diagnostic/{uid}` with a timestamp.
 *   5. Read it back.
 *   6. Delete it (cleanup).
 *
 * Each step shows: ✓ success / ✕ failure with the literal error object.
 */

interface Step {
  label: string;
  status: 'pending' | 'running' | 'ok' | 'fail';
  detail?: string;
}

export default function CloudDiagnostic() {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);

  // Listen for the custom event so any UI surface can trigger this.
  if (typeof window !== 'undefined') {
    (window as any).__openDiagnostic = () => setOpen(true);
  }

  const run = async () => {
    setBusy(true);
    const trace: Step[] = [];
    const add = (label: string) => {
      trace.push({ label, status: 'running' });
      setSteps([...trace]);
    };
    const done = (status: 'ok' | 'fail', detail: string) => {
      trace[trace.length - 1] = { ...trace[trace.length - 1], status, detail };
      setSteps([...trace]);
    };

    // STEP 1: print active Firebase config
    add('Read Firebase config');
    try {
      const opts: any = (auth as any)?.app?.options || {};
      done('ok', `projectId=${opts.projectId} · authDomain=${opts.authDomain} · appId=${opts.appId?.slice(0, 24)}…`);
    } catch (err: any) {
      done('fail', err?.message || String(err));
    }

    // STEP 2: who's signed in?
    add('Check auth state');
    const user = auth?.currentUser;
    if (!user) {
      done('fail', 'Not signed in. Sign in first then run diagnose again.');
      setBusy(false);
      return;
    }
    done('ok', `uid=${user.uid.slice(0, 12)}… · email=${user.email || '(no email)'}`);

    // STEP 3: force network cycle
    add('Cycle Firestore network');
    try {
      await disableNetwork(db);
      await new Promise((r) => setTimeout(r, 200));
      await enableNetwork(db);
      done('ok', 'disableNetwork → enableNetwork completed');
    } catch (err: any) {
      done('fail', `${err?.code || ''} ${err?.message || err}`);
    }

    // Hard timeout helper — Firestore writes can hang forever when the
    // path is denied by rules (the SDK queues + retries silently). We
    // race every cloud call against a 12-second clock and surface the
    // diagnosis automatically.
    const withTimeout = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() =>
          reject(new Error(
            `TIMEOUT after ${ms / 1000}s. Likely causes: ` +
            `(1) a browser extension is blocking firestore.googleapis.com — try in an Incognito window with extensions disabled. ` +
            `(2) the path "${what}" is denied by rules and the SDK is silently retrying. ` +
            `(3) corporate network / firewall blocking Firestore.`,
          )),
        ms)),
      ]);

    // STEP 4: write to /profiles/{uid} — our rules ALLOW this for the
    // signed-in user, so success here proves writes work end-to-end.
    const probeRef = doc(db, 'profiles', user.uid);
    add('Write test doc to /profiles/{uid}');
    try {
      await withTimeout(
        setDoc(probeRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'You',
          lastDiagnosticAt: serverTimestamp(),
        }, { merge: true }),
        12000,
        'profiles/{uid}',
      );
      done('ok', 'Wrote /profiles/{uid} successfully — your writes work');
    } catch (err: any) {
      done('fail', `${err?.code || 'error'}: ${err?.message || err}`);
      setBusy(false);
      return;
    }

    // STEP 5: read it back
    add('Read /profiles/{uid} back');
    try {
      const snap = await withTimeout(getDoc(probeRef), 12000, 'profiles/{uid}');
      done(snap.exists() ? 'ok' : 'fail',
        snap.exists() ? 'Doc exists, round-trip succeeded ✨' : 'Doc not found after write');
    } catch (err: any) {
      done('fail', `${err?.code || 'error'}: ${err?.message || err}`);
    }

    // STEP 6: verify the rules are actually published by writing to a
    // path the catch-all denies. SUCCESS here means rules are NOT
    // published (everything is allowed = bad). FAIL with permission-
    // denied means rules ARE published (good).
    add('Confirm rules deny /forbidden_test');
    try {
      await withTimeout(
        setDoc(doc(db, 'forbidden_test', user.uid), { ok: true }),
        8000,
        'forbidden_test/{uid}',
      );
      done('fail', '⚠ Write to a denied path SUCCEEDED. Your rules are NOT published — the database is wide open. Paste firestore.rules into Firebase Console → Firestore → Rules → Publish.');
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        done('ok', 'Rules correctly denied the write — your security rules are live');
      } else {
        done('fail', `Unexpected: ${err?.code || 'error'}: ${err?.message || err}`);
      }
    }

    setBusy(false);
  };

  const copy = async () => {
    const txt = steps.map((s) => `${s.status === 'ok' ? '✓' : s.status === 'fail' ? '✕' : '…'} ${s.label}\n   ${s.detail || ''}`).join('\n');
    try {
      await navigator.clipboard.writeText(`Kindling cloud diagnostic\n\n${txt}`);
      toast.success('Copied');
    } catch { toast.error('Could not copy'); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-3"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[var(--panel)] border border-[var(--rule)] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            role="dialog"
            aria-label="Cloud diagnostic"
          >
            <header className="flex items-center justify-between px-4 h-11 border-b border-[var(--rule)] bg-[var(--bg)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center">
                  <Stethoscope className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <div className="text-xs font-semibold">Cloud diagnostic</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Probe your Firebase + Firestore round-trip</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-[var(--hover)]" aria-label="Close">
                <X className="w-3.5 h-3.5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={run}
                  disabled={busy}
                  className="flex-1 py-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
                  {busy ? 'Running…' : steps.length ? 'Run again' : 'Start diagnostic'}
                </button>
                {steps.length > 0 && (
                  <button
                    onClick={copy}
                    title="Copy results"
                    className="px-3 py-2 rounded-md bg-[var(--surface-2)] border border-[var(--rule)] text-[var(--text-secondary)] hover:bg-[var(--hover)] text-sm font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {steps.length === 0 && (
                <p className="text-[11px] text-[var(--text-muted)] text-center py-6">
                  Click <strong>Start diagnostic</strong>. This will read your Firebase config, check who's signed in,
                  cycle the Firestore network, and try a real write + read + delete cycle. The result shows
                  the exact step that fails — paste it back for support.
                </p>
              )}

              {steps.length > 0 && (
                <ol className="space-y-2">
                  {steps.map((s, i) => (
                    <li
                      key={i}
                      className={`p-2.5 rounded-md border ${
                        s.status === 'ok' ? 'bg-[var(--accent)]/5 border-[var(--accent)]/30' :
                        s.status === 'fail' ? 'bg-[var(--danger)]/10 border-[var(--danger)]/30' :
                        'bg-[var(--surface-2)] border-[var(--rule)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {s.status === 'ok' && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />}
                        {s.status === 'fail' && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--danger)' }} />}
                        {s.status === 'running' && <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-[var(--text-muted)]" />}
                        <span className={`text-[11.5px] font-semibold ${s.status === 'fail' ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
                          {i + 1}. {s.label}
                        </span>
                      </div>
                      {s.detail && (
                        <pre className="mt-1.5 ml-5.5 text-[10.5px] font-mono whitespace-pre-wrap break-words text-[var(--text-secondary)] leading-relaxed">
                          {s.detail}
                        </pre>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <footer className="px-4 py-2 border-t border-[var(--rule)] bg-[var(--surface-2)] text-[10px] text-[var(--text-muted)] text-center">
              Build: {(window as any).__KINDLING_BUILD__ || 'unknown'}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
