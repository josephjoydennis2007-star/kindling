import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, UserCircle2, LogIn, Settings as SettingsIcon, Cloud, ChevronRight } from 'lucide-react';
import { isFirebaseConfigured } from '@/firebase';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@/firebase';

/**
 * UserMenu — popover that opens from the rail avatar.
 *
 * Two modes:
 *   - Local (no Firebase user): shows a "Sign in" CTA that re-opens the
 *     AuthWall, plus a brief explanation of what signing in unlocks
 *     (cloud sync, multi-device, collaboration).
 *   - Signed in: shows the user's display name + email and gives them
 *     "Edit profile", "Settings", "Sign out".
 *
 * Positioned just above the rail avatar — slides in from the bottom-left
 * corner. Closes on outside click + Escape.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  user: User | null;
  profile: UserProfile | null;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  /** Anchor point — where the avatar lives, so the popover lifts off it. */
  anchor: 'rail-bottom' | 'mobile-nav';
}

export default function UserMenu({
  open, onClose, user, profile, onOpenAuth, onOpenProfile, onOpenSettings, onSignOut, anchor,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Outside click + Esc dismissal.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Position differs per anchor — the rail's avatar is on the left, the
  // mobile bottom nav's is at the bottom centerish. Both pop up + left.
  const posClasses = anchor === 'rail-bottom'
    ? 'fixed bottom-12 left-14 ml-2'
    : 'fixed bottom-20 left-1/2 -translate-x-1/2';

  const displayName = profile?.displayName || user?.displayName || 'You';
  const email = user?.email || (user ? '' : 'Local profile — no cloud sync');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="menu"
          aria-label="User menu"
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.14 }}
          className={`${posClasses} w-[260px] bg-[var(--panel)] border border-[var(--rule)] rounded-md shadow-lg overflow-hidden z-50`}
        >
          {/* Header: identity */}
          <header className="flex items-center gap-3 p-3 border-b border-[var(--rule)] bg-[var(--surface-2)]">
            <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-semibold text-white avatar-gradient flex-shrink-0">
              {profile?.avatar || user?.photoURL
                ? <img src={profile?.avatar || user?.photoURL || ''} alt="" className="w-full h-full object-cover" />
                : displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[var(--text)] truncate">{displayName}</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">{email}</div>
            </div>
          </header>

          {/* Body — modal-specific */}
          {user ? (
            <SignedInBody
              onOpenProfile={() => { onClose(); onOpenProfile(); }}
              onOpenSettings={() => { onClose(); onOpenSettings(); }}
              onSignOut={() => { onClose(); onSignOut(); }}
            />
          ) : (
            <LocalBody
              onSignIn={() => { onClose(); onOpenAuth(); }}
              onOpenSettings={() => { onClose(); onOpenSettings(); }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SignedInBody({ onOpenProfile, onOpenSettings, onSignOut }: { onOpenProfile: () => void; onOpenSettings: () => void; onSignOut: () => void }) {
  return (
    <div className="py-1">
      <MenuItem icon={UserCircle2} label="Edit profile" onClick={onOpenProfile} />
      <MenuItem icon={SettingsIcon} label="Settings" onClick={onOpenSettings} />
      <div className="border-t border-[var(--rule)] my-1" />
      <MenuItem icon={LogOut} label="Sign out" onClick={onSignOut} danger />
    </div>
  );
}

function LocalBody({ onSignIn, onOpenSettings }: { onSignIn: () => void; onOpenSettings: () => void }) {
  return (
    <div className="py-1">
      <button
        onClick={onSignIn}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] text-[var(--accent)] font-semibold hover:bg-[var(--accent-soft)] transition-colors"
      >
        <LogIn className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1">Sign in or create account</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
      </button>
      <div className="px-3 py-2 border-y border-[var(--rule)] bg-[var(--bg)]/50">
        <div className="flex items-start gap-2 text-[10.5px] text-[var(--text-muted)] leading-snug">
          <Cloud className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>
            Sign in to enable cloud sync across devices and collaborate with
            coworkers. Local mode keeps everything on this device only.
            {!isFirebaseConfigured && (
              <> Setup is one-time — see <strong>SETUP.md</strong> in the repo.</>
            )}
          </span>
        </div>
      </div>
      <MenuItem icon={SettingsIcon} label="Settings" onClick={onOpenSettings} />
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors ${
        danger
          ? 'text-[var(--danger)] hover:bg-[var(--danger)]/10'
          : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 font-medium">{label}</span>
    </button>
  );
}
