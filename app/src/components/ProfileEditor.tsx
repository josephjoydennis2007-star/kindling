import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Save, PenLine, Clapperboard, Sparkles, Eye, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { upsertProfile, type UserProfile } from '@/firebase';

interface Props {
  open: boolean;
  initial: UserProfile;
  onClose: () => void;
  onSaved: (p: UserProfile) => void;
}

const ROLES: { id: UserProfile['role']; label: string; icon: any; gradient: string }[] = [
  { id: 'writer',   label: 'Writer',   icon: PenLine,      gradient: 'from-blue-500 to-indigo-600' },
  { id: 'director', label: 'Director', icon: Clapperboard, gradient: 'from-purple-500 to-fuchsia-600' },
  { id: 'both',     label: 'Both',     icon: Sparkles,     gradient: 'from-amber-500 to-pink-500' },
  { id: 'admin',    label: 'Admin',    icon: Crown,        gradient: 'from-emerald-500 to-teal-600' },
  { id: 'viewer',   label: 'Viewer',   icon: Eye,          gradient: 'from-zinc-500 to-zinc-700' },
];

export default function ProfileEditor({ open, initial, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<UserProfile>(initial);

  const updateAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setDraft({ ...draft, avatar: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    try {
      await upsertProfile(draft);
      onSaved(draft);
      toast.success('Profile saved');
      onClose();
    } catch (e: any) {
      toast.error(`Could not save profile: ${e?.message || e}`);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[260] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="text-sm font-bold text-[var(--text)]">Your profile</div>
              <button onClick={onClose} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Avatar */}
              <div className="flex justify-center">
                <div className="relative">
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white overflow-hidden border-2 border-[var(--accent)] shadow-2xl"
                    style={{ background: draft.avatar ? 'transparent' : 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' }}
                  >
                    {draft.avatar
                      ? <img src={draft.avatar} alt="" className="w-full h-full object-cover" />
                      : (draft.displayName || 'U').charAt(0).toUpperCase()}
                  </div>
                  <label className="absolute bottom-0 right-0 w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:brightness-110">
                    <Camera className="w-4 h-4 text-[var(--bg)]" />
                    <input type="file" accept="image/*" onChange={updateAvatar} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Display name */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5 block">Display name</label>
                <input
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)] text-[var(--text)]"
                />
              </div>

              {/* Age */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5 block">Age (optional)</label>
                <input
                  value={draft.age || ''}
                  onChange={(e) => setDraft({ ...draft, age: e.target.value })}
                  placeholder="e.g. 28"
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs outline-none focus:border-[var(--accent)] text-[var(--text)]"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 block">Your role</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => {
                    const active = draft.role === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setDraft({ ...draft, role: r.id })}
                        className={`relative p-3 rounded-lg border text-left transition-all ${
                          active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center mb-2 ${active ? 'bg-[var(--accent-soft)] border border-[var(--accent)]/40' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}>
                          <r.icon className={`w-4 h-4 ${active ? '' : 'text-[var(--text-secondary)]'}`} style={active ? { color: 'var(--accent)' } : undefined} />
                        </div>
                        <div className={`text-xs font-bold ${active ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>{r.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {draft.email && (
                <div className="text-[10px] text-[var(--text-muted)]">
                  Signed in as <span className="text-[var(--accent)]">{draft.email}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--card)] flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)]">
                Skip
              </button>
              <button
                onClick={save}
                disabled={!draft.displayName.trim()}
                className="flex-1 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                Save profile
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
