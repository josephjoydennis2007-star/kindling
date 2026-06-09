import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Film,
  Clapperboard,
  Plus,
  ChevronRight,
  Trash2,
  ScrollText,
} from 'lucide-react';
import type { Scene, Shot, BRoll, Character, SceneStatus } from '@/types';
import ShotCard from './ShotCard';
import { useAppStore } from '@/store/useAppStore';
import { formatMoney } from '@/lib/money';

interface DirectorViewProps {
  scenes: Scene[];
  shots: Record<string, Shot>;
  bRolls: Record<string, BRoll>;
  characters: Character[];
  activeSceneId: string | null;
  onSceneSelect: (id: string | null) => void;
  onAddScene: (name: string, content: string) => string;
  onDeleteScene: (id: string) => void;
  onAddShot: (sceneId: string) => string;
  onUpdateShot: (id: string, updates: Partial<Shot>) => void;
  onDeleteShot: (id: string) => void;
  onAddBRoll: (shotId: string) => string;
  onUpdateBRoll: (id: string, updates: Partial<BRoll>) => void;
  onDeleteBRoll: (id: string) => void;
  onUpdateScene: (id: string, updates: Partial<Scene>) => void;
  onReorderShots: (sceneId: string, shotIds: string[]) => void;
}

const STATUS_META: Record<SceneStatus, { label: string; color: string }> = {
  'todo': { label: 'To Do', color: 'var(--text-muted)' },
  'in-progress': { label: 'In Progress', color: 'var(--warning)' },
  'shot': { label: 'Shot', color: 'var(--info)' },
  'final': { label: 'Final', color: 'var(--success)' },
};

export default function DirectorView({
  scenes,
  shots,
  bRolls,
  characters,
  activeSceneId,
  onSceneSelect,
  onAddScene,
  onDeleteScene,
  onAddShot,
  onUpdateShot,
  onDeleteShot,
  onAddBRoll,
  onUpdateBRoll,
  onDeleteBRoll,
  onUpdateScene,
  onReorderShots,
}: DirectorViewProps) {
  const [draggedShot, setDraggedShot] = useState<string | null>(null);
  const [justAddedShot, setJustAddedShot] = useState<string | null>(null);
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [newScene, setNewScene] = useState({ name: '', content: '' });
  const [viewMode, setViewMode] = useState<'list' | 'storyboard'>('list');

  const activeScene = scenes.find(s => s.id === activeSceneId);
  const activeShots = activeScene?.shotIds.map(id => shots[id]).filter(Boolean) || [];

  const handleDragStart = (shotId: string) => setDraggedShot(shotId);
  const handleDragEnd = () => setDraggedShot(null);

  const handleDragOver = (e: React.DragEvent, targetShotId: string) => {
    e.preventDefault();
    if (!draggedShot || draggedShot === targetShotId || !activeScene) return;
    const order = [...activeScene.shotIds];
    const from = order.indexOf(draggedShot);
    const to = order.indexOf(targetShotId);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedShot);
    onReorderShots(activeScene.id, order);
  };

  const createScene = () => {
    const id = onAddScene(newScene.name, newScene.content);
    onSceneSelect(id);
    setNewScene({ name: '', content: '' });
    setShowSceneForm(false);
  };

  const addShot = () => {
    if (!activeScene) return;
    const id = onAddShot(activeScene.id);
    if (id) setJustAddedShot(id);
  };

  return (
    <div className="h-full flex">
      {/* Scene list sidebar */}
      <div className="w-56 sm:w-64 bg-[var(--sidebar)] border-r border-[var(--border)] overflow-y-auto flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-[var(--border)]">
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-2">
            <Clapperboard className="w-3.5 h-3.5" />
            Scenes ({scenes.length})
          </h3>
        </div>
        <div className="p-2 flex-1">
          {scenes.length === 0 && !showSceneForm && (
            <div className="p-6 text-center text-[var(--text-muted)] text-xs">
              <Film className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No scenes yet.</p>
              <p className="text-[10px] mt-1">Create a scene to start planning shots.</p>
            </div>
          )}

          {scenes.map((scene, i) => {
            const status = STATUS_META[scene.status] || STATUS_META.todo;
            return (
              <motion.button
                key={scene.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => onSceneSelect(scene.id)}
                draggable
                onDragStart={((e: React.DragEvent) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/x-kindling-scene', scene.id);
                }) as any}
                onDragOver={((e: React.DragEvent) => {
                  if (e.dataTransfer.types.includes('text/x-kindling-scene')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }) as any}
                onDrop={((e: React.DragEvent) => {
                  const fromId = e.dataTransfer.getData('text/x-kindling-scene');
                  if (!fromId || fromId === scene.id) return;
                  e.preventDefault();
                  const order = scenes.map((s) => s.id);
                  const fromIdx = order.indexOf(fromId);
                  const toIdx = order.indexOf(scene.id);
                  if (fromIdx < 0 || toIdx < 0) return;
                  order.splice(fromIdx, 1);
                  order.splice(toIdx, 0, fromId);
                  // Lazy import the store so we don't widen the prop interface.
                  import('@/store/useAppStore').then((m) => m.useAppStore.getState().reorderScenes(order));
                }) as any}
                className={`w-full text-left p-3 rounded-lg mb-1 transition-all group cursor-grab active:cursor-grabbing ${
                  activeSceneId === scene.id ? 'bg-[var(--active)] border-l-2 border-[var(--accent)]' : 'hover:bg-[var(--hover)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: scene.color }} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold truncate ${activeSceneId === scene.id ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                      {i + 1}. {scene.name || scene.heading}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px]" style={{ color: status.color }}>{status.label}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">· {scene.shotIds.length} shot{scene.shotIds.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-transform ${activeSceneId === scene.id ? 'rotate-90 text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                </div>
              </motion.button>
            );
          })}

          {/* New scene form */}
          {showSceneForm ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-[var(--panel)] border border-[var(--accent)] rounded-lg mt-1"
            >
              <input
                autoFocus
                value={newScene.name}
                onChange={(e) => setNewScene({ ...newScene, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') createScene(); }}
                placeholder="Scene name (e.g. INT. KITCHEN - NIGHT)"
                className="w-full px-2.5 py-2 mb-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
              />
              <textarea
                value={newScene.content}
                onChange={(e) => setNewScene({ ...newScene, content: e.target.value })}
                placeholder="What happens in this scene? Paste or write the script/action you'll build shots from..."
                className="w-full min-h-[80px] px-2.5 py-2 mb-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowSceneForm(false); setNewScene({ name: '', content: '' }); }}
                  className="flex-1 py-1.5 bg-[var(--card)] text-[var(--text-secondary)] rounded-md text-xs hover:bg-[var(--hover)]"
                >
                  Cancel
                </button>
                <button
                  onClick={createScene}
                  className="flex-1 py-1.5 bg-[var(--accent)] text-[var(--bg)] rounded-md text-xs font-semibold hover:brightness-110"
                >
                  Create
                </button>
              </div>
            </motion.div>
          ) : (
            <button
              onClick={() => setShowSceneForm(true)}
              className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--card)] border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> New Scene
            </button>
          )}
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          {/* View-mode toggle */}
          <div className="flex items-center gap-1 mb-4 bg-[var(--card)] border border-[var(--border)] rounded-lg p-0.5 w-fit ml-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold ${viewMode === 'list' ? 'bg-[var(--accent)] text-[var(--bg)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              Scene
            </button>
            <button
              onClick={() => setViewMode('storyboard')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold ${viewMode === 'storyboard' ? 'bg-[var(--accent)] text-[var(--bg)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              Storyboard
            </button>
          </div>

          {viewMode === 'storyboard' ? (
            <StoryboardGrid
              scenes={scenes}
              shots={shots}
              onPickShot={(sceneId) => { onSceneSelect(sceneId); setViewMode('list'); }}
            />
          ) : !activeScene ? (
            <div
              key="empty"
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-[var(--accent)] flex items-center justify-center mb-4 shadow-xl">
                <Clapperboard className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-lg font-bold text-[var(--text)] mb-2">No Scene Selected</h3>
              <p className="text-sm text-[var(--text-secondary)] max-w-md">
                Pick a scene on the left, or create a new one. Each scene holds its script, shots and b-roll.
              </p>
            </div>
          ) : (
            <div
              key={activeScene.id}
              className="max-w-3xl mx-auto"
            >
              {/* Scene header */}
              <div className="mb-5 pb-4 border-b-2 border-[var(--border)]">
                <div className="flex items-start gap-3">
                  <input
                    value={activeScene.name || activeScene.heading}
                    onChange={(e) => onUpdateScene(activeScene.id, { name: e.target.value, heading: e.target.value })}
                    placeholder="Scene name"
                    className="flex-1 bg-transparent text-lg font-bold text-[var(--accent)] uppercase tracking-wide outline-none border-b border-transparent focus:border-[var(--accent)]"
                    style={{ fontFamily: 'Courier Prime, monospace' }}
                  />
                  <select
                    value={activeScene.status}
                    onChange={(e) => onUpdateScene(activeScene.id, { status: e.target.value as SceneStatus })}
                    className="bg-[var(--card)] border border-[var(--border)] rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)] cursor-pointer"
                  >
                    {(Object.keys(STATUS_META) as SceneStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_META[s].label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (confirm('Delete this scene and its shots?')) {
                        onDeleteScene(activeScene.id);
                        onSceneSelect(null);
                      }
                    }}
                    className="p-2 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--hover)] rounded-lg transition-all flex-shrink-0"
                    title="Delete scene"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scene script / content */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold flex items-center gap-1.5">
                    <ScrollText className="w-3 h-3" /> Scene Script
                  </label>
                  <SceneBreakdownButton scene={activeScene} onUpdateScene={onUpdateScene} />
                </div>
                <textarea
                  value={activeScene.content}
                  onChange={(e) => onUpdateScene(activeScene.id, { content: e.target.value })}
                  placeholder="The script / action for this scene — what actually happens. Read from this as you break it into shots."
                  className="w-full min-h-[120px] bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y leading-relaxed"
                  style={{ fontFamily: 'Courier Prime, monospace' }}
                />
              </div>

              {/* Budget */}
              <div className="mb-6">
                <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 block">
                  Budget
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {(['cast', 'crew', 'location', 'props', 'post'] as const).map((k) => (
                    <div key={k}>
                      <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-0.5">{k}</div>
                      <input
                        type="number"
                        min={0}
                        defaultValue={activeScene.budget?.[k] || ''}
                        onBlur={(e) => onUpdateScene(activeScene.id, {
                          budget: { ...(activeScene.budget || {}), [k]: Number(e.target.value) || 0 },
                        } as any)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs text-[var(--text)] outline-none focus:border-[var(--accent)] tabular-nums text-right"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-right text-[10px] text-[var(--text-muted)] tabular-nums">
                  Scene total: <SceneBudgetTotal budget={activeScene.budget} />
                </div>
              </div>

              {/* Director notes */}
              <div className="mb-6">
                <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 block">
                  Director Notes
                </label>
                <textarea
                  value={activeScene.description}
                  onChange={(e) => onUpdateScene(activeScene.id, { description: e.target.value })}
                  placeholder="Mood, lighting, intent, references..."
                  className="w-full min-h-[70px] bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y"
                />
              </div>

              {/* Shots */}
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-bold">Shot List</h3>
                <span className="text-xs text-[var(--text-muted)]">{activeShots.length} shot{activeShots.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="space-y-3">
                {activeShots.map((shot, index) => (
                  <ShotCard
                    key={shot.id}
                    shot={shot}
                    index={index}
                    bRolls={bRolls}
                    characters={characters}
                    autoFocus={shot.id === justAddedShot}
                    onUpdate={onUpdateShot}
                    onDelete={onDeleteShot}
                    onAddBRoll={onAddBRoll}
                    onUpdateBRoll={onUpdateBRoll}
                    onDeleteBRoll={onDeleteBRoll}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    isDragging={draggedShot === shot.id}
                  />
                ))}
              </div>

              {activeShots.length === 0 && (
                <div className="text-center py-10 bg-[var(--panel)] border border-[var(--border)] border-dashed rounded-xl">
                  <Film className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)] opacity-50" />
                  <p className="text-sm text-[var(--text-muted)]">No shots planned yet</p>
                </div>
              )}

              <button
                onClick={addShot}
                className="w-full mt-4 py-4 bg-[var(--card)] border-2 border-[var(--border)] border-dashed rounded-xl text-sm text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex items-center justify-center gap-2 font-semibold"
              >
                <Plus className="w-4 h-4" /> Add Shot
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

/**
 * Storyboard grid — every shot across every scene as a thumbnail card.
 * Storyboard images come from Shot.storyboard; missing ones get a placeholder.
 * Clicking jumps you into that scene's normal Director view with the shot
 * selected.
 */
function StoryboardGrid({ scenes, shots, onPickShot }: {
  scenes: Scene[];
  shots: Record<string, Shot>;
  onPickShot: (sceneId: string) => void;
}) {
  if (scenes.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)] text-sm">
        No scenes yet — create one to start storyboarding.
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {scenes.map((scene) => {
        const sceneShots = scene.shotIds.map((id) => shots[id]).filter(Boolean);
        return (
          <section key={scene.id}>
            <button
              onClick={() => onPickShot(scene.id)}
              className="flex items-center gap-2 mb-3 text-left hover:opacity-80"
              aria-label={`Open scene ${scene.name || scene.heading}`}
            >
              <span className="w-2 h-4 rounded-sm" style={{ background: scene.color }} aria-hidden />
              <span className="text-sm font-bold text-[var(--accent)] uppercase tracking-wide" style={{ fontFamily: 'Courier Prime, monospace' }}>
                {scene.name || scene.heading}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">· {sceneShots.length} shot{sceneShots.length !== 1 ? 's' : ''}</span>
            </button>
            {sceneShots.length === 0 ? (
              <button
                onClick={() => onPickShot(scene.id)}
                className="text-[11px] text-[var(--text-muted)] underline hover:text-[var(--accent)]"
              >
                No shots yet — add some →
              </button>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {sceneShots.map((shot, i) => (
                  <button
                    key={shot.id}
                    onClick={() => onPickShot(scene.id)}
                    className="text-left group bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] rounded-lg overflow-hidden transition-all"
                  >
                    <div className="aspect-video bg-[var(--bg)] relative">
                      {shot.storyboard ? (
                        <img
                          src={shot.storyboard}
                          alt={shot.description || `Shot ${i + 1}`}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                          (no storyboard)
                        </div>
                      )}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold">
                        {i + 1}
                      </span>
                      {shot.shotType && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-[var(--accent)] text-[var(--bg)] text-[9px] font-bold uppercase">
                          {shot.shotType}
                        </span>
                      )}
                      {shot.durationSec ? (
                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] tabular-nums">
                          {shot.durationSec}s
                        </span>
                      ) : null}
                    </div>
                    <div className="p-2">
                      <div className="text-[11px] text-[var(--text)] line-clamp-2">
                        {shot.description || <span className="text-[var(--text-muted)] italic">(empty)</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * AI "Break down" — reads the scene content, asks the configured AI provider
 * for a strict-JSON breakdown, and merges it into the scene's description.
 * If new character names are returned they're surfaced as a one-click toast.
 */
function SceneBreakdownButton({ scene, onUpdateScene }: {
  scene: Scene;
  onUpdateScene: (id: string, updates: Partial<Scene>) => void;
}) {
  // We do it imperatively to avoid forcing the store on the whole DirectorView.
  const onClick = async () => {
    if (!scene.content?.trim()) {
      const { toast } = await import('sonner');
      toast.error('Add some scene content first');
      return;
    }
    const { useAppStore } = await import('@/store/useAppStore');
    const { toast } = await import('sonner');
    const settings = useAppStore.getState().settings;
    if (!settings.aiApiKey && settings.aiProvider !== 'ollama') {
      toast.error('Set an AI API key in Settings first');
      return;
    }
    toast('Breaking down scene…', { duration: 1500 });

    const url = settings.aiProvider === 'openai'    ? 'https://api.openai.com/v1/chat/completions'
              : settings.aiProvider === 'groq'      ? 'https://api.groq.com/openai/v1/chat/completions'
              : settings.aiProvider === 'openrouter'? 'https://openrouter.ai/api/v1/chat/completions'
              : settings.aiProvider === 'ollama'    ? `${(settings.aiEndpoint || 'http://localhost:11434').replace(/\/$/, '')}/v1/chat/completions`
              : settings.aiProvider === 'anthropic' ? 'https://api.anthropic.com/v1/messages'
              : settings.aiEndpoint;
    if (!url) { toast.error('No endpoint configured'); return; }

    const system = 'You break down a screenplay scene into production elements. Output ONLY a JSON object — no preamble — with keys: location (string), timeOfDay (string), mood (string), characters (array of uppercase names), props (array of nouns). Keep arrays under 8 items.';
    const user = `Break down this scene:\n\n${scene.content}`;

    let reply = '';
    try {
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
            max_tokens: 600,
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
    } catch (e: any) {
      toast.error(`Breakdown failed: ${e?.message || e}`);
      return;
    }
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) { toast.error('AI returned no JSON'); return; }
    let json: any = {};
    try { json = JSON.parse(match[0]); } catch { toast.error('Invalid JSON'); return; }

    const lines: string[] = [];
    if (json.location)  lines.push(`Location: ${json.location}`);
    if (json.timeOfDay) lines.push(`Time: ${json.timeOfDay}`);
    if (json.mood)      lines.push(`Mood: ${json.mood}`);
    if (Array.isArray(json.characters) && json.characters.length) lines.push(`Characters: ${json.characters.join(', ')}`);
    if (Array.isArray(json.props) && json.props.length) lines.push(`Props: ${json.props.join(', ')}`);
    const composed = lines.join('\n');
    onUpdateScene(scene.id, { description: composed || scene.description });

    // Offer to add any unknown characters to the cast
    const known = new Set(useAppStore.getState().characters.map((c) => c.name.toUpperCase()));
    const newOnes = (Array.isArray(json.characters) ? json.characters : []).filter((n: any) => typeof n === 'string' && !known.has(n.toUpperCase()));
    if (newOnes.length) {
      toast(`Add ${newOnes.length} new character${newOnes.length !== 1 ? 's' : ''} to the cast?`, {
        action: {
          label: 'Add all',
          onClick: () => {
            const addCharacter = useAppStore.getState().addCharacter;
            for (const name of newOnes) {
              addCharacter({
                name: name.toUpperCase(),
                displayName: name,
                description: '',
                color: '#3b82f6',
                image: null,
                backstory: '', goals: '', personality: '', age: '', occupation: '',
                motivation: '', conflict: '', relationships: '', notes: '',
                voiceAudio: null, tags: [], createdAt: Date.now(),
              });
            }
          },
        },
        duration: 8000,
      });
    } else {
      toast.success('Scene broken down');
    }
  };
  return (
    <button
      onClick={onClick}
      title="AI breakdown of this scene — characters, props, mood"
      className="text-[10px] px-2 py-1 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-white font-semibold hover:brightness-110 flex items-center gap-1"
    >
      ✨ Break down
    </button>
  );
}

function SceneBudgetTotal({ budget }: { budget?: Scene['budget'] }) {
  // Read currency reactively so the formatter updates when the user changes
  // currency in Settings without forcing a refresh.
  const currency = useAppStore((s) => (s.settings as any).currency);
  const total = Object.values(budget || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  return <span>{formatMoney(total, currency)}</span>;
}
