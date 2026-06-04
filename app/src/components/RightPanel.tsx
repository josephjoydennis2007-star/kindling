import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  StickyNote,
  History,
  Settings,
  Users,
  Plus,
  Trash2,
  RotateCcw,
  Palette,
  Type,
  Monitor,
  Wifi,
  Moon,
  Sun,
  ChevronDown,
  Upload,
  Mic,
  UserCircle,
  Target,
  Brain,
  Calendar,
  Briefcase,
  Flame,
  AlertTriangle,
  HeartHandshake,
  Tag,
  FileText,
  Lightbulb,
  Check,
  Sparkles,
  Wand2,
  Loader2,
  Camera,
  Pencil,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import type { Note, HistoryEntry, AppSettings, Character, Screenplay } from '@/types';
import CollabPanel from '@/components/CollabPanel';
import AIHelperPanel from '@/components/AIHelperPanel';
import AssetsPanel from '@/components/AssetsPanel';
import { fsSupported, pickFolder, saveFolderHandle, clearFolderHandle } from '@/lib/folderHandle';
import { FolderOpen } from 'lucide-react';

interface RightPanelProps {
  panel: string | null;
  onClose: () => void;
  notes: Note[];
  onAddNote: (text: string, category: Note['category']) => void;
  onDeleteNote: (id: string) => void;
  history: HistoryEntry[];
  activeStoryId: string | null;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  characters: Character[];
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void;
  onDeleteCharacter: (id: string) => void;
  screenplay: Screenplay;
  onUpdateScreenplayField: (field: keyof Screenplay, value: any) => void;
  focusCharacterId: string | null;
  onClearFocusCharacter: () => void;
}

export default function RightPanel({
  panel,
  onClose,
  notes,
  onAddNote,
  onDeleteNote,
  history,
  activeStoryId,
  settings,
  onUpdateSettings,
  characters,
  onUpdateCharacter,
  onDeleteCharacter,
  screenplay,
  onUpdateScreenplayField,
  focusCharacterId,
  onClearFocusCharacter,
}: RightPanelProps) {
  return (
    <div className={`right-panel ${panel ? 'visible' : ''}`}>
      <>
        {panel === 'instructions' && (
          <InstructionsPanel
            key="instructions"
            screenplay={screenplay}
            onUpdateField={onUpdateScreenplayField}
            onClose={onClose}
          />
        )}
        {panel === 'notes' && (
          <NotesPanel
            key="notes"
            notes={notes}
            onAdd={onAddNote}
            onDelete={onDeleteNote}
            onClose={onClose}
          />
        )}
        {panel === 'history' && (
          <HistoryPanel
            key="history"
            history={history}
            storyId={activeStoryId}
            onClose={onClose}
          />
        )}
        {panel === 'settings' && (
          <SettingsPanel
            key="settings"
            settings={settings}
            onUpdate={onUpdateSettings}
            onClose={onClose}
          />
        )}
        {panel === 'characters' && (
          <CharactersPanel
            key="characters"
            characters={characters}
            onUpdate={onUpdateCharacter}
            onDelete={onDeleteCharacter}
            onClose={onClose}
            focusCharacterId={focusCharacterId}
            onClearFocusCharacter={onClearFocusCharacter}
          />
        )}
        {panel === 'collab' && (
          <CollabPanel key="collab" onClose={onClose} />
        )}
        {panel === 'ai' && (
          <AIHelperPanel key="ai" onClose={onClose} />
        )}
        {panel === 'assets' && (
          <AssetsPanel key="assets" onClose={onClose} />
        )}
      </>
    </div>
  );
}

// ===================== INSTRUCTIONS / STORY BIBLE PANEL =====================
function InstructionsPanel({ screenplay, onUpdateField, onClose }: {
  screenplay: Screenplay;
  onUpdateField: (field: keyof Screenplay, value: any) => void;
  onClose: () => void;
}) {
  // Local drafts so the user can edit then explicitly Save / Cancel
  const [logline, setLogline] = useState(screenplay.logline);
  const [synopsis, setSynopsis] = useState(screenplay.synopsis);
  const [instructions, setInstructions] = useState(screenplay.instructions);
  const [draftEntries, setDraftEntries] = useState<string[]>([]);
  const [newEntry, setNewEntry] = useState('');

  useEffect(() => { setLogline(screenplay.logline); }, [screenplay.logline]);
  useEffect(() => { setSynopsis(screenplay.synopsis); }, [screenplay.synopsis]);
  useEffect(() => { setInstructions(screenplay.instructions); }, [screenplay.instructions]);

  const isDirty =
    logline !== screenplay.logline ||
    synopsis !== screenplay.synopsis ||
    instructions !== screenplay.instructions ||
    draftEntries.length > 0;

  const save = () => {
    onUpdateField('logline', logline);
    onUpdateField('synopsis', synopsis);
    const merged = [instructions, ...draftEntries.map((e) => `• ${e}`)].filter(Boolean).join('\n');
    onUpdateField('instructions', merged);
    setDraftEntries([]);
    toast.success('Story bible saved');
  };

  const cancel = () => {
    setLogline(screenplay.logline);
    setSynopsis(screenplay.synopsis);
    setInstructions(screenplay.instructions);
    setDraftEntries([]);
  };

  const addEntry = () => {
    const t = newEntry.trim();
    if (!t) return;
    setDraftEntries((p) => [...p, t]);
    setNewEntry('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h3 className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold flex items-center gap-2">
          <Lightbulb className="w-4 h-4" /> Story Bible
        </h3>
        <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1.5 block">Logline</label>
          <textarea
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            placeholder="One-sentence summary of your story..."
            className="w-full min-h-[60px] px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-y"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1.5 block">Synopsis</label>
          <textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="A paragraph describing the full arc..."
            className="w-full min-h-[120px] px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-y"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1.5 block">Instructions &amp; Notes to Self</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Themes, tone, rules, reminders, research, to-dos..."
            className="w-full min-h-[160px] px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-y leading-relaxed"
          />
        </div>

        {/* Add new instruction entries */}
        <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Quick add</div>
          <div className="flex gap-1.5">
            <input
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
              placeholder="Type an instruction and press Enter / Add"
              className="flex-1 px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs outline-none focus:border-[var(--accent)] text-[var(--text)]"
            />
            <button
              onClick={addEntry}
              disabled={!newEntry.trim()}
              className="px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold disabled:opacity-40 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {draftEntries.length > 0 && (
            <ul className="space-y-1">
              {draftEntries.map((e, i) => (
                <li key={i} className="text-[11px] flex items-center gap-2 text-[var(--text-secondary)]">
                  <span className="text-[var(--accent)]">•</span>
                  <span className="flex-1">{e}</span>
                  <button
                    onClick={() => setDraftEntries((p) => p.filter((_, idx) => idx !== i))}
                    className="text-[var(--text-muted)] hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Save bar */}
      <div className="flex gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--sidebar)]">
        <button
          onClick={cancel}
          disabled={!isDirty}
          className="flex-1 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!isDirty}
          className="flex-1 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Save instructions
        </button>
      </div>
    </motion.div>
  );
}

// ===================== NOTES PANEL =====================
function NotesPanel({ notes, onAdd, onDelete, onClose }: {
  notes: Note[];
  onAdd: (text: string, category: Note['category']) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<Note['category']>('general');

  const categoryColors = {
    general: 'var(--accent)',
    plot: 'var(--success)',
    character: 'var(--danger)',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h3 className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold flex items-center gap-2">
          <StickyNote className="w-4 h-4" /> Notes
        </h3>
        <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {notes.length === 0 && (
          <div className="text-center py-8 text-[var(--text-muted)] text-xs">
            <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No notes yet</p>
          </div>
        )}
        {notes.slice().reverse().map(note => (
          <motion.div
            key={note.id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-3 p-3 bg-[var(--panel)] rounded-lg border border-[var(--border)]"
            style={{ borderLeft: `3px solid ${categoryColors[note.category]}` }}
          >
            <div className="text-[10px] uppercase text-[var(--text-muted)] font-bold mb-1">{note.category}</div>
            <p className="text-xs text-[var(--text)] leading-relaxed">{note.text}</p>
            <div className="flex justify-end mt-2">
              <button onClick={() => onDelete(note.id)} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
                Delete
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="p-4 border-t border-[var(--border)] space-y-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Note['category'])}
          className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
        >
          <option value="general">General</option>
          <option value="plot">Plot</option>
          <option value="character">Character</option>
        </select>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a new note..."
          className="w-full min-h-[80px] px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-y"
        />
        <div className="flex gap-2">
          <VoiceToText onText={(t) => setText((cur) => (cur ? cur + ' ' + t : t))} />
          <button
            onClick={() => { if (text.trim()) { onAdd(text, category); setText(''); } }}
            className="flex-1 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-lg text-xs font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add Note
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ===================== HISTORY PANEL =====================
function HistoryPanel({ history, storyId, onClose }: {
  history: HistoryEntry[];
  storyId: string | null;
  onClose: () => void;
}) {
  const storyHistory = history.filter(h => h.storyId === storyId);
  const [previewing, setPreviewing] = useState<HistoryEntry | null>(null);

  const handleRestore = (entry: HistoryEntry) => {
    try {
      const data = JSON.parse(entry.data);
      const store = useAppStore.getState();
      useAppStore.setState({ ...store, ...data });
      toast.success('Version restored');
      setPreviewing(null);
    } catch {
      toast.error('Failed to restore version');
    }
  };

  // Build a quick word-level diff between current state and a snapshot.
  // We turn each into a screenplay plain-text dump and then run a line-by-line
  // longest-common-subsequence pass to colour additions / deletions.
  const buildDiff = (snapshot: HistoryEntry) => {
    const stripTags = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    const dump = (state: any) =>
      (state?.screenplay?.elements || [])
        .map((e: any) => `${(e.type || 'action').toUpperCase()}: ${stripTags(e.content || '').trim()}`)
        .join('\n');
    let curr = '';
    let prev = '';
    try {
      curr = dump(useAppStore.getState());
      prev = dump(JSON.parse(snapshot.data));
    } catch {
      return { curr: [], prev: [], diff: [] as { kind: 'same' | 'add' | 'del'; text: string }[] };
    }
    const a = prev.split('\n');
    const b = curr.split('\n');
    // Simple LCS table
    const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out: { kind: 'same' | 'add' | 'del'; text: string }[] = [];
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: a[i] }); i++; }
      else { out.push({ kind: 'add', text: b[j] }); j++; }
    }
    while (i < a.length) { out.push({ kind: 'del', text: a[i++] }); }
    while (j < b.length) { out.push({ kind: 'add', text: b[j++] }); }
    return { curr: b, prev: a, diff: out };
  };

  if (previewing) {
    const { diff } = buildDiff(previewing);
    const additions = diff.filter((d) => d.kind === 'add').length;
    const deletions = diff.filter((d) => d.kind === 'del').length;
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="h-full flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h3 className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold flex items-center gap-2">
            <History className="w-4 h-4" /> Preview restore
          </h3>
          <button onClick={() => setPreviewing(null)} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--card)] flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold">
          <span className="text-emerald-400">+ {additions} add</span>
          <span className="text-red-400">− {deletions} del</span>
          <span className="text-[var(--text-muted)] ml-auto truncate">{previewing.label}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-snug">
          {diff.length === 0 && <p className="text-[var(--text-muted)] text-center mt-6">No diffable content in this snapshot.</p>}
          {diff.map((line, idx) => (
            <div
              key={idx}
              className={`px-2 py-0.5 rounded ${
                line.kind === 'add' ? 'bg-emerald-500/15 text-emerald-300'
                : line.kind === 'del' ? 'bg-red-500/15 text-red-300 line-through'
                : 'text-[var(--text-secondary)]'
              }`}
              style={{ wordBreak: 'break-word' }}
            >
              <span className="text-[var(--text-muted)] mr-1.5">
                {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
              </span>
              {line.text || ' '}
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-[var(--border)] flex gap-2">
          <button
            onClick={() => setPreviewing(null)}
            className="flex-1 py-2 rounded-md bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)]"
          >
            Back
          </button>
          <button
            onClick={() => { if (confirm('Apply this restore? Current state will overwrite.')) handleRestore(previewing); }}
            className="flex-1 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" /> Restore this version
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h3 className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold flex items-center gap-2">
          <History className="w-4 h-4" /> History
        </h3>
        <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {storyHistory.length === 0 && (
          <div className="text-center py-8 text-[var(--text-muted)] text-xs">
            <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No history for this story yet</p>
            <p className="text-[10px] mt-1">Changes are tracked automatically</p>
          </div>
        )}
        {storyHistory.map((entry, i) => {
          const date = new Date(entry.timestamp);
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="mb-3 p-3 bg-[var(--panel)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
            >
              <div className="text-[11px] text-[var(--accent)] font-semibold mb-1">
                {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {entry.label}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                Version {storyHistory.length - i}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setPreviewing(entry)}
                  className="text-[10px] px-2 py-1 bg-[var(--accent)]/15 text-[var(--accent)] rounded hover:bg-[var(--accent)] hover:text-[var(--bg)] transition-all flex items-center gap-1"
                >
                  Preview
                </button>
                <button
                  onClick={() => { if (confirm('Restore this version? Current state will be overwritten.')) handleRestore(entry); }}
                  className="text-[10px] px-2 py-1 bg-[var(--success)]/20 text-[var(--success)] rounded hover:bg-[var(--success)] hover:text-white transition-all flex items-center gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Restore
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ===================== SETTINGS PANEL =====================
function SettingsPanel({ settings, onUpdate, onClose }: {
  settings: AppSettings;
  onUpdate: (s: Partial<AppSettings>) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'appearance' | 'editor' | 'files' | 'collab' | 'cloud'>('appearance');

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h3 className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold flex items-center gap-2">
          <Settings className="w-4 h-4" /> Settings
        </h3>
        <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] overflow-x-auto">
        {[
          { id: 'appearance' as const, icon: Palette, label: 'Appearance' },
          { id: 'editor' as const, icon: Type, label: 'Editor' },
          { id: 'files' as const, icon: FolderOpen, label: 'Files' },
          { id: 'collab' as const, icon: Users, label: 'Collab' },
          { id: 'cloud' as const, icon: Wifi, label: 'Cloud' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-all ${
              activeTab === tab.id
                ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'appearance' && (
          <div className="space-y-4">
            {/* Theme */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2 block">
                Theme
              </label>
              <div className="flex gap-2">
                <ThemeButton
                  icon={Moon}
                  label="Dark"
                  active={settings.theme === 'dark'}
                  onClick={() => onUpdate({ theme: 'dark' })}
                />
                <ThemeButton
                  icon={Sun}
                  label="Light"
                  active={settings.theme === 'light'}
                  onClick={() => onUpdate({ theme: 'light' })}
                />
                <ThemeButton
                  icon={Palette}
                  label="Custom"
                  active={settings.theme === 'custom'}
                  onClick={() => onUpdate({ theme: 'custom' })}
                />
              </div>
            </div>

            {/* Colors */}
            {settings.theme === 'custom' && (
              <>
                <ColorPicker label="Primary Color" value={settings.primaryColor} onChange={(v) => onUpdate({ primaryColor: v })} />
                <ColorPicker label="Accent Color" value={settings.accentColor} onChange={(v) => onUpdate({ accentColor: v })} />
                <ColorPicker label="Background" value={settings.bgColor} onChange={(v) => onUpdate({ bgColor: v })} />
                <ColorPicker label="Sidebar" value={settings.sidebarColor} onChange={(v) => onUpdate({ sidebarColor: v })} />
                <ColorPicker label="Panel" value={settings.panelColor} onChange={(v) => onUpdate({ panelColor: v })} />
                <ColorPicker label="Text Color" value={settings.textColor} onChange={(v) => onUpdate({ textColor: v })} />
                <ColorPicker label="Text Secondary" value={settings.textSecondaryColor} onChange={(v) => onUpdate({ textSecondaryColor: v })} />
                <ColorPicker label="Border Color" value={settings.borderColor} onChange={(v) => onUpdate({ borderColor: v })} />
              </>
            )}
          </div>
        )}

        {activeTab === 'editor' && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2 block">
                Font Family
              </label>
              <select
                value={settings.fontFamily}
                onChange={(e) => onUpdate({ fontFamily: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
              >
                <option value="Courier New, Courier, monospace">Courier New (Screenplay)</option>
                <option value="Courier Prime, monospace">Courier Prime</option>
                <option value="Inter, sans-serif">Inter (Modern)</option>
                <option value="Georgia, serif">Georgia (Serif)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2 block">
                Font Size: {settings.fontSize}pt
              </label>
              <input
                type="range"
                min={8}
                max={18}
                value={settings.fontSize}
                onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2 block">
                Line Height: {settings.lineHeight}
              </label>
              <input
                type="range"
                min={0.8}
                max={2}
                step={0.1}
                value={settings.lineHeight}
                onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2 block">
                Auto Save
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdate({ autoSave: !settings.autoSave })}
                  className={`w-10 h-5 rounded-full transition-all ${settings.autoSave ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.autoSave ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-xs text-[var(--text-secondary)]">{settings.autoSave ? 'On' : 'Off'}</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2 block">
                Auto Save Interval: {settings.autoSaveInterval / 1000}s
              </label>
              <input
                type="range"
                min={10000}
                max={300000}
                step={10000}
                value={settings.autoSaveInterval}
                onChange={(e) => onUpdate({ autoSaveInterval: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-4">
            <div className="p-4 bg-[var(--card)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-semibold text-[var(--text)]">Default Save Folder</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                When set, exports go straight here without the system Save dialog.
                {!fsSupported() && ' Browser does not support folder picking — exports will use Save dialog or downloads.'}
              </p>
              <div className="text-xs text-[var(--text-secondary)] mb-3 truncate">
                Current: <span className="text-[var(--accent)] font-mono">{settings.defaultSaveFolder || 'Not set'}</span>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!fsSupported()}
                  onClick={async () => {
                    const h = await pickFolder();
                    if (h) {
                      await saveFolderHandle(h);
                      onUpdate({ defaultSaveFolder: h.name });
                      toast.success(`Folder set to "${h.name}"`);
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-md text-xs font-semibold hover:brightness-110 disabled:opacity-40"
                >
                  {settings.defaultSaveFolder ? 'Change folder' : 'Choose folder'}
                </button>
                {settings.defaultSaveFolder && (
                  <button
                    onClick={async () => {
                      await clearFolderHandle();
                      onUpdate({ defaultSaveFolder: null });
                      toast.success('Folder cleared');
                    }}
                    className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] text-xs rounded-md hover:border-red-400 hover:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 bg-[var(--card)] rounded-lg border border-[var(--border)]">
              <div className="text-sm font-semibold text-[var(--text)] mb-1">Social Bar</div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">Quick access to social media for inspiration breaks.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdate({ socialBarEnabled: !settings.socialBarEnabled })}
                  className={`w-10 h-5 rounded-full transition-all ${settings.socialBarEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.socialBarEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-xs text-[var(--text-secondary)]">{settings.socialBarEnabled ? 'Visible' : 'Hidden'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'collab' && (
          <div className="space-y-4">
            <div className="p-4 bg-[var(--card)] rounded-lg border border-[var(--border)]">
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1 block">Display name</label>
              <input
                value={settings.userDisplayName}
                onChange={(e) => onUpdate({ userDisplayName: e.target.value })}
                placeholder="How collaborators see you"
                className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-xs outline-none focus:border-[var(--accent)] text-[var(--text)]"
              />
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1 mt-3 block">Default role</label>
              <select
                value={settings.userRole}
                onChange={(e) => onUpdate({ userRole: e.target.value as any })}
                className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-xs outline-none focus:border-[var(--accent)] text-[var(--text)]"
              >
                <option value="admin">Admin</option>
                <option value="writer">Writer</option>
                <option value="director">Director</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[11px] text-[var(--text-secondary)]">
              Real-time presence, voice/video calls, and admin notifications need a backend (Firebase RTDB or WebRTC signaling).
              The UI is fully built — wire in your endpoints to go live.
            </div>
          </div>
        )}

        {activeTab === 'cloud' && (
          <div className="space-y-4">
            <div className="p-4 bg-[var(--card)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-2">
                <Wifi className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-semibold text-[var(--text)]">Cloud Sync</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                Sync your stories to Firebase cloud storage. Work offline and sync when you go online.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdate({ cloudSync: !settings.cloudSync })}
                  className={`w-10 h-5 rounded-full transition-all ${settings.cloudSync ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.cloudSync ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-xs text-[var(--text-secondary)]">{settings.cloudSync ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            <div className="p-4 bg-[var(--card)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="w-4 h-4 text-[var(--info)]" />
                <span className="text-sm font-semibold text-[var(--text)]">Storage Info</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Using Firebase free tier (1GB storage). Your data syncs automatically when online.
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ThemeButton({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border transition-all ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-light)] hover:text-[var(--text)]'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1 block">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-[var(--border)]"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
      </div>
    </div>
  );
}

// ===================== CHARACTERS PANEL =====================
function CharactersPanel({ characters, onUpdate, onDelete, onClose, focusCharacterId, onClearFocusCharacter }: {
  characters: Character[];
  onUpdate: (id: string, updates: Partial<Character>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  focusCharacterId: string | null;
  onClearFocusCharacter: () => void;
}) {
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const addCharacter = useAppStore(state => state.addCharacter);

  useEffect(() => {
    if (focusCharacterId) {
      setSelectedChar(focusCharacterId);
      setCreating(false);
      onClearFocusCharacter();
    }
  }, [focusCharacterId, onClearFocusCharacter]);

  const char = selectedChar ? characters.find(c => c.id === selectedChar) : null;

  // Adding a new character → open the FULL detail editor (every field), so the
  // user fills everything in one place. On save we create the profile (deduped
  // by name in the store) and jump straight to its paragraph profile.
  if (creating) {
    return (
      <CharacterEditor
        isNew
        initial={{}}
        onCancel={() => setCreating(false)}
        onClose={onClose}
        onSave={(draft) => {
          const id = addCharacter(draft);
          setCreating(false);
          setSelectedChar(id);
        }}
      />
    );
  }

  if (char) {
    return (
      <CharacterDetail
        character={char}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onBack={() => setSelectedChar(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h3 className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold flex items-center gap-2">
          <Users className="w-4 h-4" /> Characters ({characters.length})
        </h3>
        <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {characters.length === 0 && (
          <div className="text-center py-8 text-[var(--text-muted)] text-xs">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No characters yet</p>
          </div>
        )}

        {characters.map((c, i) => (
          <motion.button
            key={c.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setSelectedChar(c.id)}
            className="w-full flex items-center gap-3 p-3 mb-2 bg-[var(--panel)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)] transition-all text-left group"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 overflow-hidden"
              style={{ background: c.image ? 'transparent' : c.color }}
            >
              {c.image ? <img src={c.image} alt={c.name} className="w-full h-full object-cover" /> : c.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--text)] truncate">{c.name}</div>
              {c.description && (
                <div className="text-[10px] text-[var(--text-muted)] truncate">{c.description}</div>
              )}
            </div>
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors -rotate-90" />
          </motion.button>
        ))}

      </div>

      <div className="p-4 border-t border-[var(--border)]">
        <button
          onClick={() => setCreating(true)}
          className="w-full py-2.5 bg-[var(--accent)] text-[var(--bg)] rounded-lg text-xs font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add Character
        </button>
      </div>
    </motion.div>
  );
}

// Shared field set for the character editor. `name` is handled separately at
// the top of the editor; everything else (incl. age + the image prompt) is
// driven from this list so the New and Edit forms stay identical.
const CHARACTER_FIELDS: { key: keyof Character; label: string; icon: any; placeholder: string; type: 'text' | 'textarea' }[] = [
  { key: 'pronouns', label: 'Pronouns', icon: UserCircle, placeholder: 'she/her, they/them, …', type: 'text' },
  { key: 'age', label: 'Age', icon: Calendar, placeholder: 'e.g. 28', type: 'text' },
  { key: 'occupation', label: 'Occupation', icon: Briefcase, placeholder: 'Job or role', type: 'text' },
  { key: 'archetype', label: 'Archetype', icon: Sparkles, placeholder: 'Mentor / Trickster / Anti-hero…', type: 'text' },
  { key: 'description', label: 'Short description', icon: FileText, placeholder: 'One-line summary (shown in the list)', type: 'textarea' },
  { key: 'imagePrompt', label: 'Image prompt — face · body · side view', icon: Camera, placeholder: 'Appearance for AI image generation: face, hair, build, how old they look, wardrobe, distinctive features, and side-view / profile notes…', type: 'textarea' },
  { key: 'voiceOf', label: 'Voice', icon: Mic, placeholder: 'Speech style, dialect, idiom', type: 'textarea' },
  { key: 'personality', label: 'Personality', icon: Brain, placeholder: 'Traits, demeanor, attitude...', type: 'textarea' },
  { key: 'want', label: 'Want (conscious)', icon: Target, placeholder: 'What they think they need', type: 'textarea' },
  { key: 'need', label: 'Need (unconscious)', icon: Target, placeholder: 'What they actually need', type: 'textarea' },
  { key: 'fear', label: 'Fear / Wound', icon: AlertTriangle, placeholder: 'Deepest fear or wound', type: 'textarea' },
  { key: 'secret', label: 'Secret', icon: AlertTriangle, placeholder: 'The hidden truth', type: 'textarea' },
  { key: 'goals', label: 'Goals (plot)', icon: Target, placeholder: 'Concrete scene-level goals', type: 'textarea' },
  { key: 'motivation', label: 'Motivation', icon: Flame, placeholder: 'What drives them?', type: 'textarea' },
  { key: 'conflict', label: 'Conflict', icon: AlertTriangle, placeholder: 'Internal and external conflicts', type: 'textarea' },
  { key: 'backstory', label: 'Backstory', icon: FileText, placeholder: 'History and background...', type: 'textarea' },
  { key: 'relationships', label: 'Relationships', icon: HeartHandshake, placeholder: 'Connections to other characters', type: 'textarea' },
  { key: 'notes', label: 'Notes', icon: StickyNote, placeholder: 'Additional notes...', type: 'textarea' },
];

function stripPeriod(s: string) { return String(s || '').trim().replace(/[.\s]+$/, ''); }

// Weave a character's fields into a single readable paragraph profile.
function buildCharacterParagraph(c: Character): string {
  const name = c.displayName || c.name || 'This character';
  const out: string[] = [];
  const ident: string[] = [];
  if (c.age) ident.push(/^\d+$/.test(String(c.age).trim()) ? `${String(c.age).trim()}-year-old` : String(c.age).trim());
  if (c.occupation) ident.push(c.occupation.trim());
  let opener = name;
  if (ident.length) opener += ` — ${ident.join(', ')}`;
  if (c.archetype) opener += ` — embodies the ${stripPeriod(c.archetype)} archetype`;
  out.push(stripPeriod(opener) + '.');
  const add = (prefix: string, v?: string) => { if (v && v.trim()) out.push(`${prefix} ${stripPeriod(v)}.`); };
  if (c.description) out.push(stripPeriod(c.description) + '.');
  add('Personality:', c.personality);
  add('On the surface, they want', c.want);
  add('What they truly need is', c.need);
  add('Deepest fear:', c.fear);
  add('Secret:', c.secret);
  add('Driven by', c.motivation);
  add('Central conflict:', c.conflict);
  add('Goals:', c.goals);
  add('Backstory:', c.backstory);
  add('Relationships:', c.relationships);
  add('Voice:', c.voiceOf);
  if (c.notes && c.notes.trim()) out.push(stripPeriod(c.notes) + '.');
  if (out.length <= 1 && !c.description) out.push('No details yet — tap "Edit character" to fill out this profile.');
  return out.join(' ');
}

/**
 * CharacterEditor — the full-detail form, shared by "Add new" and "Edit".
 * Works on a LOCAL draft and only commits on Save, so a half-typed new
 * character never leaves an orphan profile behind.
 */
function CharacterEditor({ initial, isNew, onSave, onCancel, onClose, onDelete }: {
  initial: Partial<Character>;
  isNew?: boolean;
  onSave: (draft: Partial<Character>) => void;
  onCancel: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Character>>(() => ({ ...initial }));
  const set = (k: keyof Character, v: any) => setDraft((prev) => ({ ...prev, [k]: v }));
  const nameVal = (draft.name ?? '') as string;
  const canSave = nameVal.trim().length > 0;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => set('image', ev.target?.result as string);
    reader.readAsDataURL(file);
  };
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => set('voiceAudio', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const avatarLetter = (nameVal || 'C').charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors text-xs"
          aria-label="Cancel editing"
        >
          <ChevronDown className="w-4 h-4 rotate-90" />
          {isNew ? 'Cancel' : 'Back'}
        </button>
        <div className="flex items-center gap-2">
          <AIGenerateCharacterButton character={draft as Character} onUpdate={(updates) => setDraft((prev) => ({ ...prev, ...updates }))} />
          {onDelete && (
            <button
              onClick={() => { if (confirm('Delete this character?')) onDelete(); }}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
              aria-label="Delete character"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-[11px] text-[var(--text-muted)] mb-3 text-center">
          {isNew ? 'Fill in everything you know — blank fields are fine, you can edit later.' : 'Edit the profile, then Save.'}
        </p>

        {/* Profile Image */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white overflow-hidden border-2 border-[var(--accent)] shadow-lg"
              style={{ background: draft.image ? 'transparent' : (draft.color || 'var(--accent)') }}
            >
              {draft.image ? <img src={draft.image} alt={nameVal} className="w-full h-full object-cover" /> : avatarLetter}
            </div>
            <label className="absolute bottom-0 right-0 w-7 h-7 bg-[var(--accent)] rounded-full flex items-center justify-center cursor-pointer shadow-md hover:brightness-110 transition-all">
              <Upload className="w-3.5 h-3.5 text-[var(--bg)]" />
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Name */}
        <div className="mb-3">
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1 flex items-center gap-1">
            <UserCircle className="w-3 h-3" /> Name
          </label>
          <input
            autoFocus={isNew}
            type="text"
            value={nameVal}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Character name"
            className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* All other fields */}
        <div className="space-y-3">
          {CHARACTER_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1 flex items-center gap-1">
                <field.icon className="w-3 h-3" />
                {field.label}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  value={(draft[field.key] as string) ?? ''}
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full min-h-[60px] px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-y"
                />
              ) : (
                <input
                  type="text"
                  value={(draft[field.key] as string) ?? ''}
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                />
              )}
            </div>
          ))}
        </div>

        {/* Voice Audio */}
        <div className="mt-4 p-3 bg-[var(--card)] rounded-lg border border-[var(--border)]">
          <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2 flex items-center gap-1">
            <Mic className="w-3 h-3" />
            Voice Sample
          </label>
          {draft.voiceAudio && (
            <div className="mb-2">
              <audio controls src={draft.voiceAudio} className="w-full h-8" />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--accent)] hover:brightness-110">
            <Upload className="w-3.5 h-3.5" />
            {draft.voiceAudio ? 'Replace audio' : 'Upload voice sample'}
            <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Footer: Save / Cancel */}
      <div className="p-4 border-t border-[var(--border)] flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 bg-[var(--card)] text-[var(--text-secondary)] rounded-lg text-xs hover:bg-[var(--hover)]"
        >
          Cancel
        </button>
        <button
          onClick={() => { if (canSave) onSave(draft); }}
          disabled={!canSave}
          className="flex-1 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-lg text-xs font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" /> {isNew ? 'Create Character' : 'Save'}
        </button>
      </div>
    </motion.div>
  );
}

/**
 * CharacterDetail — read-only PROFILE view (everything woven into a paragraph)
 * with an "Edit character" button that flips to the full CharacterEditor.
 */
function CharacterDetail({ character, onUpdate, onDelete, onBack, onClose }: {
  character: Character;
  onUpdate: (id: string, updates: Partial<Character>) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  if (mode === 'edit') {
    return (
      <CharacterEditor
        initial={character}
        onCancel={() => setMode('view')}
        onClose={onClose}
        onDelete={() => { onDelete(character.id); onBack(); }}
        onSave={(draft) => { onUpdate(character.id, draft); setMode('view'); }}
      />
    );
  }

  const paragraph = buildCharacterParagraph(character);
  const chips = [
    character.pronouns,
    character.age ? `Age ${character.age}` : '',
    character.occupation,
    character.archetype,
  ].filter(Boolean) as string[];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors text-xs"
          aria-label="Back to character list"
        >
          <ChevronDown className="w-4 h-4 rotate-90" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('edit')}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded-lg text-xs font-semibold hover:brightness-110 transition-all"
            aria-label="Edit character"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => { if (confirm('Delete this character?')) { onDelete(character.id); onBack(); } }}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
            aria-label="Delete character"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Avatar + name + meta */}
        <div className="flex flex-col items-center mb-4">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white overflow-hidden border-2 border-[var(--accent)] shadow-lg mb-3"
            style={{ background: character.image ? 'transparent' : character.color }}
          >
            {character.image ? (
              <img src={character.image} alt={character.name} className="w-full h-full object-cover" />
            ) : (
              character.name.charAt(0)
            )}
          </div>
          <h2 className="text-lg font-bold text-[var(--text)] text-center break-words">{character.displayName || character.name}</h2>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mt-2">
              {chips.map((chip, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--hover)] text-[var(--text-secondary)] border border-[var(--border)]">{chip}</span>
              ))}
            </div>
          )}
          {character.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mt-2">
              {character.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--hover)] text-[var(--accent)] border border-[var(--border)] flex items-center gap-1">
                  <Tag className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Paragraph profile */}
        <div className="mb-4">
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Profile
          </h3>
          <p className="text-sm leading-relaxed text-[var(--text)] whitespace-pre-wrap break-words">{paragraph}</p>
        </div>

        {/* Image prompt */}
        {character.imagePrompt && character.imagePrompt.trim() && (
          <div className="mb-4 p-3 bg-[var(--card)] rounded-lg border border-[var(--border)]">
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 flex items-center gap-1">
              <Camera className="w-3 h-3" /> Image prompt — face · body · side view
            </h3>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words font-mono">{character.imagePrompt}</p>
          </div>
        )}

        {/* Voice sample */}
        {character.voiceAudio && (
          <div className="mb-4 p-3 bg-[var(--card)] rounded-lg border border-[var(--border)]">
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 flex items-center gap-1">
              <Mic className="w-3 h-3" /> Voice sample
            </h3>
            <audio controls src={character.voiceAudio} className="w-full h-8" />
          </div>
        )}

        {/* Prominent edit button */}
        <button
          onClick={() => setMode('edit')}
          className="w-full py-2.5 bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-lg text-xs font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex items-center justify-center gap-1.5"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit character
        </button>
      </div>
    </motion.div>
  );
}

/**
 * "Generate with AI" button for a character card. Uses the configured AI
 * provider (Settings → AI tab) and asks it for a JSON object with the
 * profile fields. We then merge whatever fields it returns.
 */
function AIGenerateCharacterButton({ character, onUpdate }: {
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}) {
  const settings = useAppStore((s) => s.settings);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!settings.aiApiKey && settings.aiProvider !== 'ollama') {
      toast.error('Add an AI API key in Settings first');
      return;
    }
    setBusy(true);
    try {
      const seed = JSON.stringify({
        name: character.name,
        age: character.age,
        occupation: character.occupation,
        archetype: character.archetype,
        traits: character.personality,
        description: character.description,
        notes: character.notes,
      });
      const system = 'You generate concise but vivid screenwriter character bios as STRICT JSON. ' +
        'Output ONLY a JSON object — no preamble — with keys: age, occupation, pronouns, archetype, voiceOf, want, need, fear, secret, personality, backstory, motivation, conflict, relationships, imagePrompt. ' +
        'Each value 1–2 sentences max, EXCEPT imagePrompt which is a vivid physical-appearance prompt for AI image generation describing face, hair, build, apparent age, wardrobe, distinctive features AND a side-view / profile note (so face, body and side view can all be rendered). age is just a number or short phrase.';
      const user = `Fill out a character bio based on this seed JSON. Keep tone cinematic and specific. Always give an age and an imagePrompt.\n\nSEED:\n${seed}`;

      const url = settings.aiProvider === 'openai'    ? 'https://api.openai.com/v1/chat/completions'
                : settings.aiProvider === 'groq'      ? 'https://api.groq.com/openai/v1/chat/completions'
                : settings.aiProvider === 'openrouter'? 'https://openrouter.ai/api/v1/chat/completions'
                : settings.aiProvider === 'ollama'    ? `${(settings.aiEndpoint || 'http://localhost:11434').replace(/\/$/, '')}/v1/chat/completions`
                : settings.aiProvider === 'anthropic' ? 'https://api.anthropic.com/v1/messages'
                : settings.aiEndpoint;
      if (!url) throw new Error('No endpoint configured');

      let reply = '';
      if (settings.aiProvider === 'anthropic') {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': settings.aiApiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: settings.aiModel || 'claude-3-5-haiku-latest',
            max_tokens: 800,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        });
        if (!r.ok) throw new Error(`Anthropic ${r.status}`);
        const j = await r.json();
        reply = j.content?.[0]?.text || '';
      } else {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(settings.aiApiKey ? { authorization: `Bearer ${settings.aiApiKey}` } : {}),
          },
          body: JSON.stringify({
            model: settings.aiModel || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
          }),
        });
        if (!r.ok) throw new Error(`AI ${r.status}`);
        const j = await r.json();
        reply = j.choices?.[0]?.message?.content || '';
      }

      const match = reply.match(/\{[\s\S]*\}/);
      if (!match) { toast.error('AI returned no JSON'); return; }
      const json = JSON.parse(match[0]);
      const allowed: (keyof Character)[] = ['age', 'occupation', 'pronouns', 'archetype', 'voiceOf', 'want', 'need', 'fear', 'secret', 'personality', 'backstory', 'motivation', 'conflict', 'relationships', 'imagePrompt'];
      const patch: Partial<Character> = {};
      for (const k of allowed) {
        if (typeof (json as any)[k] === 'string' && (json as any)[k].trim()) {
          (patch as any)[k] = (json as any)[k].trim();
        }
      }
      onUpdate(patch);
      toast.success('Character profile generated');
    } catch (e: any) {
      toast.error(`Generate failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={generate}
      disabled={busy}
      title="Fill missing fields with AI"
      aria-label="Generate character profile with AI"
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-white text-[11px] font-semibold hover:brightness-110 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
      {busy ? 'Generating…' : 'AI fill'}
    </button>
  );
}

/**
 * Web Speech API → live transcription button. No backend, no key. Stops on
 * second click or when the browser hands us a "final" result. Browsers that
 * don't support it show a tooltip explaining and disable themselves.
 */
function VoiceToText({ onText }: { onText: (chunk: string) => void }) {
  const [active, setActive] = useState(false);
  const [recRef] = useState<{ current: any }>({ current: null });
  const SpeechRec = (typeof window !== 'undefined') && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const supported = !!SpeechRec;

  const toggle = () => {
    if (!supported) {
      toast.error('Voice notes need a browser with Web Speech (Chrome / Edge / Safari).');
      return;
    }
    if (active) {
      try { recRef.current?.stop(); } catch {}
      setActive(false);
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) onText(r[0].transcript.trim());
      }
    };
    rec.onerror = (e: any) => { toast.error(`Voice error: ${e?.error || 'unknown'}`); setActive(false); };
    rec.onend = () => setActive(false);
    rec.start();
    recRef.current = rec;
    setActive(true);
  };

  return (
    <button
      onClick={toggle}
      disabled={!supported}
      title={supported ? (active ? 'Stop recording' : 'Record voice note') : 'Voice not supported in this browser'}
      aria-pressed={active}
      className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
        active
          ? 'bg-red-500 text-white border-red-600 animate-pulse'
          : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40'
      }`}
    >
      <Mic className="w-3.5 h-3.5" />
      {active ? 'Stop' : 'Voice'}
    </button>
  );
}
