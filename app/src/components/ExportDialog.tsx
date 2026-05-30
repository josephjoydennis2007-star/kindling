import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  FileType2,
  FileJson,
  FileCode,
  FileDown,
  FileBadge,
  FolderOpen,
  Check,
  PenLine,
  Clapperboard,
  Users2,
  Sparkles,
  StickyNote,
  Layers,
  Film,
  Music2,
  Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { exportProject, type ExportFormat, type ExportSelection, type ExportTarget } from '@/lib/exporters';
import {
  fsSupported,
  loadFolderHandle,
  pickFolder,
  saveFolderHandle,
  clearFolderHandle,
} from '@/lib/folderHandle';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FORMATS: { id: ExportFormat; label: string; sub: string; icon: any }[] = [
  { id: 'pdf',      label: 'PDF',           sub: 'Printable, fixed layout',  icon: FileBadge },
  { id: 'docx',     label: 'Word (.docx)',  sub: 'Editable in Word / Pages', icon: FileType2 },
  { id: 'fountain', label: 'Fountain',      sub: 'Final Draft / Highland / WriterDuet', icon: FileCode },
  { id: 'fdx',      label: 'Final Draft',   sub: '.fdx — opens natively in Final Draft', icon: FileCode },
  { id: 'html',     label: 'HTML',          sub: 'Open in any browser',      icon: FileCode },
  { id: 'md',       label: 'Markdown',      sub: 'For Notion, GitHub, etc.', icon: FileText },
  { id: 'txt',      label: 'Plain Text',    sub: 'Universal, screenplay-formatted', icon: FileText },
  { id: 'json',     label: 'JSON Backup',   sub: 'Full project backup',      icon: FileJson },
];

const TARGETS: { id: ExportTarget; label: string; sub: string; icon: any }[] = [
  { id: 'writer',   label: 'Writer Only',   sub: 'Screenplay + bible',                    icon: PenLine },
  { id: 'director', label: 'Director Only', sub: 'Scenes, shots, b-roll',                 icon: Clapperboard },
  { id: 'both',     label: 'Both',          sub: 'Complete writer + director production', icon: Sparkles },
];

export default function ExportDialog({ open, onClose }: Props) {
  const characters = useAppStore((s) => s.characters);
  const stories = useAppStore((s) => s.stories);
  const activeStoryId = useAppStore((s) => s.activeStoryId);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const storyTitle = useMemo(() => {
    return stories.find((s) => s.id === activeStoryId)?.title || 'screenplay';
  }, [stories, activeStoryId]);

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [target, setTarget] = useState<ExportTarget>('both');
  const [folderHandle, setFolderHandle] = useState<any | null>(null);
  const [savePicker, setSavePicker] =
    useState<ExportSelection['savePicker']>('default-folder');

  const [include, setInclude] = useState<ExportSelection['include']>({
    titlePage: true,
    logline: true,
    synopsis: true,
    instructions: false,
    notes: true,
    acts: true,
    beats: true,
    sections: true,
    screenplay: true,
    scenes: true,
    shots: true,
    bRolls: true,
    audio: true,
    characters: true,
    characterIds: [],
    allCharacters: true,
  });

  useEffect(() => {
    if (!open) return;
    loadFolderHandle().then((h) => setFolderHandle(h));
  }, [open]);

  const toggle = (key: keyof typeof include) =>
    setInclude((p) => ({ ...p, [key]: !p[key as keyof typeof p] }));

  const toggleCharacter = (id: string) => {
    setInclude((p) => {
      const has = p.characterIds.includes(id);
      const next = has
        ? p.characterIds.filter((x) => x !== id)
        : [...p.characterIds, id];
      return { ...p, characterIds: next, allCharacters: next.length === characters.length };
    });
  };

  const toggleAllCharacters = () =>
    setInclude((p) => ({
      ...p,
      allCharacters: !p.allCharacters,
      characterIds: !p.allCharacters ? characters.map((c) => c.id) : [],
    }));

  const handlePickFolder = async () => {
    if (!fsSupported()) {
      toast.error('Folder picking is only supported in Chrome / Edge / Opera.');
      return;
    }
    const handle = await pickFolder();
    if (!handle) {
      toast.message('Folder selection cancelled');
      return;
    }
    await saveFolderHandle(handle);
    setFolderHandle(handle);
    updateSettings({ defaultSaveFolder: handle.name });
    toast.success(`Save folder set to "${handle.name}"`);
  };

  const handleClearFolder = async () => {
    await clearFolderHandle();
    setFolderHandle(null);
    updateSettings({ defaultSaveFolder: null });
    toast.success('Default folder cleared');
  };

  const handleExport = async () => {
    const sel: ExportSelection = { format, target, include, savePicker };
    try {
      toast.loading('Building export…', { id: 'export' });
      const result = await exportProject(useAppStore.getState(), sel, storyTitle, {
        folderHandle,
      });
      if (result.method === 'folder') {
        toast.success(`Saved ${result.filename} to your folder`, { id: 'export' });
      } else {
        toast.success(`Downloaded ${result.filename}`, { id: 'export' });
      }
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(`Export failed: ${e?.message || 'unknown error'}`, { id: 'export' });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[90vh] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shadow">
                  <FileDown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[var(--text)]">Export</div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {storyTitle} · Pick format, content, and where to save
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--hover)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Format */}
              <div>
                <SectionTitle icon={FileBadge} label="Format" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {FORMATS.map((f) => {
                    const active = format === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFormat(f.id)}
                        className={`relative p-3 rounded-lg border text-left transition-all ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <f.icon className={`w-4 h-4 mb-1 ${active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                        <div className="text-xs font-semibold text-[var(--text)]">{f.label}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{f.sub}</div>
                        {active && (
                          <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-[var(--accent)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target */}
              <div>
                <SectionTitle icon={Sparkles} label="What to export" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {TARGETS.map((t) => {
                    const active = target === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTarget(t.id)}
                        className={`p-3 rounded-lg border text-left transition-all flex items-start gap-2 ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <t.icon className={`w-4 h-4 mt-0.5 ${active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                        <div>
                          <div className="text-xs font-semibold text-[var(--text)]">{t.label}</div>
                          <div className="text-[10px] text-[var(--text-muted)]">{t.sub}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content checklist */}
              <div>
                <SectionTitle icon={StickyNote} label="Include in document" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  <Check3
                    label="Title page"
                    checked={include.titlePage}
                    onChange={() => toggle('titlePage')}
                  />
                  <Check3 label="Logline" checked={include.logline} onChange={() => toggle('logline')} />
                  <Check3 label="Synopsis" checked={include.synopsis} onChange={() => toggle('synopsis')} />
                  <Check3 label="Instructions / Story Bible" checked={include.instructions} onChange={() => toggle('instructions')} />
                  <Check3 label="Notes" icon={StickyNote} checked={include.notes} onChange={() => toggle('notes')} />
                  <Check3 label="Acts (plot board)" icon={Layers} checked={include.acts} onChange={() => toggle('acts')} />
                  <Check3 label="Beats" checked={include.beats} onChange={() => toggle('beats')} />
                  <Check3 label="Writer sections" checked={include.sections} onChange={() => toggle('sections')} />

                  {(target === 'writer' || target === 'both') && (
                    <Check3 label="Screenplay pages" icon={PenLine} checked={include.screenplay} onChange={() => toggle('screenplay')} />
                  )}

                  {(target === 'director' || target === 'both') && (
                    <>
                      <Check3 label="Scenes" icon={Film} checked={include.scenes} onChange={() => toggle('scenes')} />
                      <Check3 label="Shots" icon={Camera} checked={include.shots} onChange={() => toggle('shots')} />
                      <Check3 label="B-rolls" checked={include.bRolls} onChange={() => toggle('bRolls')} />
                      <Check3 label="Audio cues" icon={Music2} checked={include.audio} onChange={() => toggle('audio')} />
                    </>
                  )}
                </div>
              </div>

              {/* Characters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <SectionTitle icon={Users2} label="Character Profiles" />
                  <label className="inline-flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={include.characters}
                      onChange={() => toggle('characters')}
                      className="accent-[var(--accent)]"
                    />
                    Include character section
                  </label>
                </div>

                {include.characters && (
                  characters.length === 0 ? (
                    <div className="text-[11px] text-[var(--text-muted)] p-3 border border-dashed border-[var(--border)] rounded-lg">
                      No characters yet.
                    </div>
                  ) : (
                    <div>
                      <label className="inline-flex items-center gap-2 text-[11px] mb-2 text-[var(--text-secondary)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={include.allCharacters}
                          onChange={toggleAllCharacters}
                          className="accent-[var(--accent)]"
                        />
                        Select all
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                        {characters.map((c) => {
                          const checked =
                            include.allCharacters || include.characterIds.includes(c.id);
                          return (
                            <Check3
                              key={c.id}
                              label={c.name}
                              checked={checked}
                              onChange={() => toggleCharacter(c.id)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Save location */}
              <div>
                <SectionTitle icon={FolderOpen} label="Save location" />
                <div className="space-y-2">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSavePicker('default-folder')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSavePicker('default-folder'); }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      savePicker === 'default-folder'
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-[var(--text)]">Default folder</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {folderHandle?.name
                          ? `Will save into "${folderHandle.name}" silently`
                          : 'Not set yet — click "Choose folder"'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePickFolder(); }}
                        className="px-2.5 py-1 rounded-md text-[11px] bg-[var(--accent)] text-[var(--bg)] font-semibold hover:brightness-110"
                      >
                        {folderHandle ? 'Change' : 'Choose folder'}
                      </button>
                      {folderHandle && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClearFolder(); }}
                          className="px-2.5 py-1 rounded-md text-[11px] bg-[var(--card)] border border-[var(--border)] hover:border-red-400 hover:text-red-400"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setSavePicker('system-dialog')}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      savePicker === 'system-dialog'
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-[var(--text)]">Ask each time (Save dialog)</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        Opens the system Save-As dialog. Falls back to download if unsupported.
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setSavePicker('download')}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      savePicker === 'download'
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-[var(--text)]">Browser download</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        Goes to your default Downloads folder
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--border)] bg-[var(--card)]">
              <div className="text-[10px] text-[var(--text-muted)]">
                {settings.defaultSaveFolder ? `Default: ${settings.defaultSaveFolder}` : 'No default folder set'}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:border-[var(--text-muted)] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-xs font-bold flex items-center gap-1.5 hover:brightness-110 transition-all"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Export
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">
      <Icon className="w-3 h-3" />
      {label}
    </div>
  );
}

function Check3({ label, checked, onChange, icon: Icon }: { label: string; checked: boolean; onChange: () => void; icon?: any }) {
  return (
    <label
      className={`flex items-center gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-all ${
        checked
          ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--text)]'
          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[var(--accent)]" />
      {Icon && <Icon className="w-3.5 h-3.5 opacity-70" />}
      <span className="text-[11px]">{label}</span>
    </label>
  );
}
