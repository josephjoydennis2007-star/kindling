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
                className={`w-full text-left p-3 rounded-lg mb-1 transition-all group ${
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
          {!activeScene ? (
            <div
              key="empty"
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-orange-600 flex items-center justify-center mb-4 shadow-xl">
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
                <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2 flex items-center gap-1.5">
                  <ScrollText className="w-3 h-3" /> Scene Script
                </label>
                <textarea
                  value={activeScene.content}
                  onChange={(e) => onUpdateScene(activeScene.id, { content: e.target.value })}
                  placeholder="The script / action for this scene — what actually happens. Read from this as you break it into shots."
                  className="w-full min-h-[120px] bg-[var(--panel)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors resize-y leading-relaxed"
                  style={{ fontFamily: 'Courier Prime, monospace' }}
                />
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
