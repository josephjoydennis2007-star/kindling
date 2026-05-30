import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Plus,
  ArrowRight,
  Film,
  Clock,
  Tv,
  Sparkles,
  Camera,
  Mic,
  Music2,
  Megaphone,
  Youtube,
  Globe,
  Drama,
  Wand2,
  Layers,
} from 'lucide-react';
import type { Story, StoryType } from '@/types';

interface StorySelectorProps {
  stories: Story[];
  onSelectStory: (id: string) => void;
  onCreateStory: (title: string, type: StoryType) => string;
}

const STORY_TYPES: { id: StoryType; label: string; description: string; icon: any; gradient: string }[] = [
  { id: 'movie',       label: 'Feature Film',  description: '90–180 min, 3-act',          icon: Film,      gradient: 'from-blue-500 to-purple-600' },
  { id: 'tv-series',   label: 'TV Series',     description: 'Multi-season episodic',     icon: Tv,        gradient: 'from-pink-500 to-rose-600' },
  { id: 'tv-show',     label: 'TV Show',       description: 'Variety / talk / reality',  icon: Sparkles,  gradient: 'from-yellow-500 to-orange-600' },
  { id: 'mini-series', label: 'Mini Series',   description: '3–10 episode arc',          icon: Layers,    gradient: 'from-indigo-500 to-blue-600' },
  { id: 'thriller',    label: 'Thriller',      description: 'Suspense-focused genre',    icon: Wand2,     gradient: 'from-red-600 to-zinc-900' },
  { id: 'documentary', label: 'Documentary',   description: 'Non-fiction / interview',   icon: Camera,    gradient: 'from-emerald-500 to-teal-600' },
  { id: 'short-film',  label: 'Short Film',    description: 'Under 40 min',              icon: Film,      gradient: 'from-cyan-500 to-blue-600' },
  { id: 'music-video', label: 'Music Video',   description: 'Lyric / performance',       icon: Music2,    gradient: 'from-fuchsia-500 to-pink-600' },
  { id: 'commercial',  label: 'Commercial',    description: '15–60s spot',               icon: Megaphone, gradient: 'from-amber-500 to-red-600' },
  { id: 'youtube',     label: 'YouTube / Vlog',description: 'Long & short form',         icon: Youtube,   gradient: 'from-red-500 to-red-700' },
  { id: 'web-series',  label: 'Web Series',    description: 'Online episodic',           icon: Globe,     gradient: 'from-sky-500 to-indigo-600' },
  { id: 'stage-play',  label: 'Stage Play',    description: 'Theatre script',            icon: Drama,     gradient: 'from-purple-500 to-fuchsia-600' },
  { id: 'animation',   label: 'Animation',     description: 'Animated / motion',         icon: Mic,       gradient: 'from-teal-500 to-emerald-600' },
];

export default function StorySelector({ stories, onSelectStory, onCreateStory }: StorySelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedType, setSelectedType] = useState<StoryType>('movie');

  const handleCreate = () => {
    const title = newTitle.trim() || 'Untitled Story';
    onCreateStory(title, selectedType);
    setShowCreate(false);
    setNewTitle('');
    setSelectedType('movie');
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-3xl"
      >
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-16 h-16 rounded-md bg-[var(--accent)] flex items-center justify-center mx-auto mb-4"
          >
            <Film className="w-8 h-8 text-[var(--accent-ink)]" />
          </motion.div>
          <h1 className="text-3xl font-bold mb-2">Kindling</h1>
          <p className="text-sm text-[var(--text-muted)]">Choose a story to continue, or start a new one</p>
        </div>

        {/* Create new */}
        {!showCreate ? (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowCreate(true)}
            className="w-full mb-6 p-5 bg-[var(--card)] border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-[var(--hover)] flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold">Create New Story</div>
              <div className="text-xs text-[var(--text-muted)]">Movie · TV · Short · Music Video · YouTube · more</div>
            </div>
            <ArrowRight className="w-5 h-5 ml-auto" />
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto'}}
            className="mb-6 p-5 bg-[var(--card)] border border-[var(--accent)] rounded-xl"
          >
            <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1 block">Title</label>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Story title..."
              className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] mb-4"
            />

            <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 block">Story / Video Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-[280px] overflow-y-auto pr-1 -mr-1">
              {STORY_TYPES.map((t) => {
                const active = selectedType === t.id;
                return (
                  <motion.button
                    key={t.id}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedType(t.id)}
                    className={`relative p-3 rounded-lg text-left transition-all border ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--text-muted)]'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center mb-2 ${active ? 'bg-[var(--accent-soft)] border border-[var(--accent)]/40' : 'bg-[var(--surface-2)] border border-[var(--border)]'}`}>
                      <t.icon className={`w-4 h-4 ${active ? '' : 'text-[var(--text-secondary)]'}`} style={active ? { color: 'var(--accent)' } : undefined} />
                    </div>
                    <div className={`text-xs font-semibold ${active ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                      {t.label}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">
                      {t.description}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 bg-[var(--hover)] text-[var(--text-secondary)] rounded-lg text-xs hover:bg-[var(--active)]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-lg text-xs font-semibold hover:brightness-110"
              >
                Create Story
              </button>
            </div>
          </motion.div>
        )}

        {/* Story list */}
        {stories.length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-3 px-1">
              Recent Stories
            </h3>
            <div className="space-y-2">
              {stories.map((story, i) => {
                const meta = STORY_TYPES.find(t => t.id === story.type) || STORY_TYPES[0];
                return (
                  <motion.button
                    key={story.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => onSelectStory(story.id)}
                    className="w-full p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition-all flex items-center gap-4 text-left group"
                  >
                    <div className="w-12 h-12 rounded-md bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--accent)] transition-colors">
                      <meta.icon className="w-6 h-6 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                        {story.title}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--hover)] text-[var(--text-secondary)] uppercase tracking-wider">
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(story.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-8 text-center">
          <p className="text-[10px] text-[var(--text-muted)]">
            All stories are saved locally · Optional cloud sync · Invite collaborators from inside the app
          </p>
        </div>

        {/* Quick fallback for old icon import */}
        <BookOpen className="hidden" />
      </motion.div>
    </div>
  );
}
