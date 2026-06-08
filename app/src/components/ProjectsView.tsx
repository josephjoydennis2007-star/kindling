import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, FolderKanban, Plus, Trash2, FileText, Upload, BookOpen, Sparkles, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import type { Project, StoryType } from '@/types';

/**
 * Projects — a creative home (like a Claude Project) that holds many stories
 * plus a master prompt, standing instructions, and knowledge the AI uses to
 * build on-brand stories. Opens on `app:openProjects`.
 */
const TYPES: { id: StoryType; label: string }[] = [
  { id: 'youtube', label: 'YouTube' }, { id: 'web-series', label: 'Web series' }, { id: 'tv-series', label: 'TV series' },
  { id: 'movie', label: 'Movie' }, { id: 'short-film', label: 'Short film' }, { id: 'animation', label: 'Animation' },
  { id: 'music-video', label: 'Music video' }, { id: 'commercial', label: 'Commercial' },
];

async function pushProjectCloud(id: string) {
  try {
    const p = useAppStore.getState().projects.find((x) => x.id === id);
    if (!p) return;
    const { pushProject } = await import('@/lib/cloudProjects');
    await pushProject(p);
  } catch { /* offline / not signed in — local persist already done */ }
}

export default function ProjectsView({ onOpenStory }: { onOpenStory?: () => void }) {
  const [open, setOpen] = useState(false);
  const projects = useAppStore((s) => s.projects);
  const stories = useAppStore((s) => s.stories);
  const createProject = useAppStore((s) => s.createProject);
  const updateProject = useAppStore((s) => s.updateProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const setActiveProject = useAppStore((s) => s.setActiveProject);
  const addProjectKnowledge = useAppStore((s) => s.addProjectKnowledge);
  const removeProjectKnowledge = useAppStore((s) => s.removeProjectKnowledge);
  const createStory = useAppStore((s) => s.createStory);
  const [selId, setSelId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => { setOpen(true); setSelId((id) => id || useAppStore.getState().activeProjectId || useAppStore.getState().projects[0]?.id || null); };
    document.addEventListener('app:openProjects', onOpen);
    return () => document.removeEventListener('app:openProjects', onOpen);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const sel = projects.find((p) => p.id === selId) || null;
  const projStories = (id: string) => stories.filter((s) => s.projectId === id);

  const newProject = () => {
    const id = createProject('New project');
    setSelId(id);
    pushProjectCloud(id);
  };
  const patch = (p: Partial<Project>) => { if (sel) { updateProject(sel.id, p); pushProjectCloud(sel.id); } };
  const addKnowledgeText = () => {
    if (!sel) return;
    const name = window.prompt('Knowledge title (e.g. "Tone & style", "Recurring characters")');
    if (name === null) return;
    const content = window.prompt('Paste the knowledge text:') || '';
    addProjectKnowledge(sel.id, name || 'Note', content);
    pushProjectCloud(sel.id);
  };
  const onFiles = (files: FileList | null) => {
    if (!files || !sel) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => { addProjectKnowledge(sel.id, f.name, String(reader.result || '')); pushProjectCloud(sel.id); };
      reader.readAsText(f);
    });
    toast.success(`Added ${files.length} file${files.length === 1 ? '' : 's'} to knowledge`);
  };
  const openProjectAndNewStory = () => {
    if (!sel) return;
    setActiveProject(sel.id);
    createStory(`${sel.name} — new story`, sel.defaultType || 'youtube', sel.id);
    setOpen(false);
    onOpenStory?.();
  };
  const removeProject = () => {
    if (!sel) return;
    if (!window.confirm(`Delete project "${sel.name}"? Its stories are kept (just un-linked).`)) return;
    const id = sel.id;
    deleteProject(id);
    import('@/lib/cloudProjects').then((m) => m.deleteProjectCloud(id)).catch(() => {});
    setSelId(useAppStore.getState().projects[0]?.id || null);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl h-[min(700px,92vh)] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl flex overflow-hidden"
          >
            {/* Project list */}
            <div className="w-56 flex-shrink-0 border-r border-[var(--border)] bg-[var(--sidebar)] flex flex-col">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-bold text-[var(--text)]">Projects</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {projects.length === 0 && <p className="text-[11px] text-[var(--text-muted)] px-2 py-4">No projects yet. Create one to group your stories under a shared brief.</p>}
                {projects.map((p) => (
                  <button key={p.id} onClick={() => setSelId(p.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg mb-0.5 transition-colors ${selId === p.id ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'}`}>
                    <div className="text-[12px] font-semibold truncate">{p.name}</div>
                    <div className="text-[9.5px] text-[var(--text-muted)]">{projStories(p.id).length} stor{projStories(p.id).length === 1 ? 'y' : 'ies'}</div>
                  </button>
                ))}
              </div>
              <div className="p-2 border-t border-[var(--border)]">
                <button onClick={newProject} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110">
                  <Plus className="w-3.5 h-3.5" /> New project
                </button>
              </div>
            </div>

            {/* Project editor */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[var(--text)] truncate">{sel ? sel.name : 'Select a project'}</span>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"><X className="w-4 h-4" /></button>
              </div>

              {!sel ? (
                <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm">Pick or create a project on the left.</div>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <Field label="Project name">
                    <input defaultValue={sel.name} key={`name-${sel.id}`} onBlur={(e) => patch({ name: e.target.value || 'Untitled Project' })}
                      className="w-full bg-[var(--card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
                  </Field>

                  <Field label="Master prompt" hint="What every story here is about + the format & tone. The AI builds new stories to fit this.">
                    <textarea defaultValue={sel.about} key={`about-${sel.id}`} onBlur={(e) => patch({ about: e.target.value })} rows={4}
                      placeholder="e.g. A weekly YouTube comedy series — a chaotic trio of flatmates. Each episode is a 5–8 min self-contained sketch with a cold open, escalating mishap, and a button gag. Punchy, warm, PG-13."
                      className="w-full bg-[var(--card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] resize-y" />
                  </Field>

                  <Field label="Instructions" hint="Standing rules for the AI (recurring characters, do's & don'ts, structure).">
                    <textarea defaultValue={sel.instructions} key={`instr-${sel.id}`} onBlur={(e) => patch({ instructions: e.target.value })} rows={3}
                      placeholder="Always include the three leads: MAX, JORDAN, PRIYA. Keep scenes in one or two locations. End on a hard joke."
                      className="w-full bg-[var(--card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] resize-y" />
                  </Field>

                  <Field label="Default story type">
                    <select defaultValue={sel.defaultType || 'youtube'} key={`type-${sel.id}`} onChange={(e) => patch({ defaultType: e.target.value as StoryType })}
                      className="bg-[var(--card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]">
                      {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </Field>

                  {/* Knowledge */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1.5"><BookOpen className="w-3 h-3" /> Knowledge</div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Upload className="w-3 h-3" /> File (.txt/.md)</button>
                        <button onClick={addKnowledgeText} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Plus className="w-3 h-3" /> Note</button>
                      </div>
                    </div>
                    <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
                    {sel.knowledge.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)] py-3 text-center border border-dashed border-[var(--border)] rounded-md">Add reference text the AI should know — tone guides, character bios, lore, examples.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {sel.knowledge.map((k) => (
                          <div key={k.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--card)] border border-[var(--border)]">
                            <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                            <span className="text-[12px] text-[var(--text)] truncate flex-1">{k.name}</span>
                            <span className="text-[9px] text-[var(--text-muted)]">{Math.max(1, Math.round((k.content || '').length / 1000))}k</span>
                            <button onClick={() => { removeProjectKnowledge(sel.id, k.id); pushProjectCloud(sel.id); }} className="p-0.5 text-[var(--text-muted)] hover:text-[var(--danger)]"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stories in this project */}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5">Stories in this project</div>
                    {projStories(sel.id).length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)] py-2">No stories yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {projStories(sel.id).map((s) => (
                          <button key={s.id} onClick={() => { useAppStore.getState().setActiveProject(sel.id); useAppStore.getState().loadStory(s.id); setOpen(false); onOpenStory?.(); }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[12px] text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]">
                            <FolderOpen className="w-3.5 h-3.5 text-[var(--text-muted)]" /> {s.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {sel && (
                <footer className="px-5 py-3 border-t border-[var(--border)] flex items-center gap-2">
                  <button onClick={removeProject} className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--hover)]" title="Delete project"><Trash2 className="w-3.5 h-3.5" /></button>
                  <div className="flex-1" />
                  <span className="text-[10px] text-[var(--text-muted)] hidden sm:flex items-center gap-1"><Sparkles className="w-3 h-3 text-[var(--accent)]" /> In Claude: "build a new episode in my <b className="mx-1">{sel.name}</b> project"</span>
                  <button onClick={openProjectAndNewStory} className="flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-bold bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110">
                    <Plus className="w-3.5 h-3.5" /> New story here
                  </button>
                </footer>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1.5">
        {label}{hint && <span className="ml-2 font-normal normal-case tracking-normal text-[var(--text-muted)]/70">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
