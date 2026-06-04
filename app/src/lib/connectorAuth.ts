/**
 * connectorAuth — let a Google-signed-in user attach an email+password to
 * their EXISTING account, so the Kindling Connector (the Cloudflare Worker
 * that builds stories from Claude) can sign in as them. Stories then land in
 * their real account — the one with all their work — not a separate one.
 *
 * - If the account already has a password provider → updatePassword.
 * - Otherwise → link an EmailAuthProvider credential to the same uid.
 * - Firebase may demand a fresh login first (requires-recent-login); we
 *   transparently re-auth with the Google popup and retry.
 */
import { auth } from '@/firebase';
import {
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
  reauthenticateWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';

export async function setConnectorPassword(password: string): Promise<{ email: string }> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in first.');
  const email = user.email;
  if (!email) throw new Error('Your account has no email address on file.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

  const hasPassword = (user.providerData || []).some((p) => p?.providerId === 'password');

  const withReauth = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      if (e?.code === 'auth/requires-recent-login') {
        // Re-prove identity (Google popup), then retry the change.
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
        await fn();
      } else {
        throw e;
      }
    }
  };

  if (hasPassword) {
    await withReauth(() => updatePassword(user, password));
  } else {
    const cred = EmailAuthProvider.credential(email, password);
    await withReauth(async () => { await linkWithCredential(user, cred); });
  }
  return { email };
}
