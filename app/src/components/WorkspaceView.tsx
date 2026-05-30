import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Music2,
  Mic,
  Sparkles,
  ExternalLink,
  Plus,
  Trash2,
  Briefcase,
  ChevronRight,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { WorkspaceLink } from '@/types';

// Categories are assigned `tileClass` from the accent-derived palette
// (defined in index.css as .ws-tile-1 through .ws-tile-5). Switching the
// app accent retunes every tile coherently — no hardcoded colors here.
const CATEGORIES: { id: WorkspaceLink['category']; label: string; description: string; icon: any; tileClass: string }[] = [
  { id: 'video',    label: 'Video Editing',    description: 'DaVinci Resolve, CapCut, Premiere…', icon: Film,     tileClass: 'ws-tile-1' },
  { id: 'audio',    label: 'Audio · SFX · Music · Ambience', description: 'Freesound, Pixabay, Mixkit…', icon: Music2, tileClass: 'ws-tile-2' },
  { id: 'voice',    label: 'Voice Over',       description: 'ElevenLabs, Fish Audio, Murf…',      icon: Mic,      tileClass: 'ws-tile-3' },
  { id: 'ai-video', label: 'AI Video Creation',description: 'Runway, Pika, Luma, HeyGen, Kling…', icon: Sparkles, tileClass: 'ws-tile-4' },
  { id: 'custom',   label: 'Custom Links',     description: 'Your own tools',                     icon: Briefcase,tileClass: 'ws-tile-5' },
];

export default function WorkspaceView() {
  const links = useAppStore((s) => s.workspaceLinks);
  const addLink = useAppStore((s) => s.addWorkspaceLink);
  const deleteLink = useAppStore((s) => s.deleteWorkspaceLink);

  const [active, setActive] = useState<WorkspaceLink['category'] | 'all'>('all');
  const [showAdd, setShowAdd] = useState<WorkspaceLink['category'] | null>(null);
  const [newLink, setNewLink] = useState({ label: '', url: '' });

  const visible = active === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.id === active);

  return (
    <div className="h-full flex flex-col bg-[var(--bg)]">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--sidebar)] overflow-x-auto">
        <div className="flex items-center gap-2 mr-3 flex-shrink-0">
          <Briefcase className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Workspace</span>
        </div>
        <button
          onClick={() => setActive('all')}
          className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex-shrink-0 ${
            active === 'all'
              ? 'bg-[var(--accent)] text-[var(--bg)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
          }`}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex-shrink-0 ${
              active === c.id
                ? 'bg-[var(--accent)] text-[var(--bg)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
            }`}
          >
            <c.icon className="w-3.5 h-3.5" />
            {c.label.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {visible.map((cat) => {
          const items = links.filter((l) => l.category === cat.id);
          return (
            <motion.section
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--panel)] border border-[var(--border)] rounded-xl overflow-hidden"
            >
              <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                  <div className={`${cat.tileClass} w-9 h-9 rounded-md flex items-center justify-center`}>
                    <cat.icon className="w-5 h-5 text-white drop-shadow" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--text)]">{cat.label}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{cat.description}</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowAdd((p) => (p === cat.id ? null : cat.id))}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--accent)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add link
                </button>
              </header>

              <AnimatePresence>
                {showAdd === cat.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-b border-[var(--border)] bg-[var(--card)] overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row gap-2 p-3">
                      <input
                        value={newLink.label}
                        onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
                        placeholder="Label (e.g. My ElevenLabs project)"
                        className="flex-1 px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      />
                      <input
                        value={newLink.url}
                        onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                        placeholder="https://…"
                        className="flex-1 px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      />
                      <button
                        onClick={() => {
                          if (!newLink.label || !newLink.url) return;
                          addLink({ category: cat.id, label: newLink.label, url: newLink.url });
                          setNewLink({ label: '', url: '' });
                          setShowAdd(null);
                        }}
                        className="px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-semibold hover:brightness-110"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowAdd(null)}
                        className="px-2.5 py-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.length === 0 && (
                  <div className="col-span-full text-center text-[11px] text-[var(--text-muted)] py-6 italic">
                    No tools yet. Click <strong>Add link</strong> to add one.
                  </div>
                )}
                {items.map((l) => (
                  <LinkCard key={l.id} link={l} tileClass={cat.tileClass} onDelete={() => deleteLink(l.id)} />
                ))}
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}

function LinkCard({ link, tileClass, onDelete }: { link: WorkspaceLink; tileClass?: string; onDelete: () => void }) {
  const open = () => window.open(link.url, '_blank', 'noopener,noreferrer');
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="group flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--accent)] transition-all"
    >
      <div className={`${tileClass || 'bg-[var(--surface-2)] border border-[var(--border)]'} w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0`}>
        <ExternalLink className="w-4 h-4 text-white drop-shadow" />
      </div>
      <button onClick={open} className="flex-1 text-left min-w-0">
        <div className="text-xs font-semibold text-[var(--text)] truncate group-hover:text-[var(--accent)]">
          {link.label}
        </div>
        <div className="text-[10px] text-[var(--text-muted)] truncate">{link.url}</div>
      </button>
      <button
        onClick={open}
        title="Open"
        className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--hover)]"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onDelete}
        title="Remove"
        className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}
