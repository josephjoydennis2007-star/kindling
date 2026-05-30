import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  Plus,
  Trash2,
  Tag,
  X,
  GripVertical,
  Layers,
} from 'lucide-react';
import type { Act, Beat } from '@/types';
import { BEAT_SHEETS } from '@/lib/beatSheets';
import { Wand2 } from 'lucide-react';

interface PlotBoardViewProps {
  plotBoard: { acts: Act[] };
  beats: Record<string, Beat>;
  onAddAct: () => void;
  onUpdateAct: (id: string, updates: Partial<Act>) => void;
  onDeleteAct: (id: string) => void;
  onAddBeat: (actId: string) => string;
  onUpdateBeat: (id: string, updates: Partial<Beat>) => void;
  onDeleteBeat: (id: string) => void;
  onMoveBeat: (beatId: string, fromActId: string, toActId: string) => void;
  onReorderBeats?: (actId: string, beatIds: string[]) => void;
}

// Soft color suggestions per beat type so they read at a glance.
const BEAT_TYPE_COLORS: Record<string, string> = {
  setup: '#3b82f6',
  hook: '#f97316',
  inciting: '#eab308',
  turn: '#a855f7',
  twist: '#ec4899',
  midpoint: '#06b6d4',
  crisis: '#ef4444',
  climax: '#dc2626',
  payoff: '#22c55e',
  tag: '#64748b',
  other: '#94a3b8',
};

const BEAT_TYPES = ['setup', 'hook', 'inciting', 'turn', 'twist', 'midpoint', 'crisis', 'climax', 'payoff', 'tag', 'other'] as const;

export default function PlotBoardView({
  plotBoard,
  beats,
  onAddAct,
  onUpdateAct,
  onDeleteAct,
  onAddBeat,
  onUpdateBeat,
  onDeleteBeat,
  onMoveBeat,
  onReorderBeats,
}: PlotBoardViewProps) {
  const [draggedBeat, setDraggedBeat] = useState<string | null>(null);
  const [dragOverAct, setDragOverAct] = useState<string | null>(null);
  const [dragOverBeat, setDragOverBeat] = useState<string | null>(null);
  const [justAddedBeat, setJustAddedBeat] = useState<string | null>(null);
  const [expandedBeat, setExpandedBeat] = useState<string | null>(null);

  const handleDragStart = (beatId: string) => {
    setDraggedBeat(beatId);
  };

  const handleDragEnd = () => {
    setDraggedBeat(null);
    setDragOverAct(null);
  };

  const handleDragOver = (e: React.DragEvent, actId: string) => {
    e.preventDefault();
    setDragOverAct(actId);
  };

  const handleDrop = (e: React.DragEvent, targetActId: string) => {
    e.preventDefault();
    setDragOverAct(null);
    if (!draggedBeat) return;
    const beat = beats[draggedBeat];
    if (!beat) return;
    // If we're dropping inside the same act and not on a specific beat, do nothing.
    if (beat.actId === targetActId && !dragOverBeat) return;
    if (beat.actId === targetActId) return; // handled by handleBeatDrop
    onMoveBeat(draggedBeat, beat.actId, targetActId);
  };

  // Drop on a specific beat → reorder within act (if same), or insert at that
  // position (if cross-act).
  const handleBeatDrop = (e: React.DragEvent, targetActId: string, targetBeatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverAct(null);
    setDragOverBeat(null);
    if (!draggedBeat || draggedBeat === targetBeatId) return;
    const beat = beats[draggedBeat];
    if (!beat) return;

    if (beat.actId === targetActId) {
      // Intra-act reorder
      const targetAct = plotBoard.acts.find((a) => a.id === targetActId);
      if (!targetAct) return;
      const order = targetAct.beatIds.slice();
      const fromIdx = order.indexOf(draggedBeat);
      const toIdx = order.indexOf(targetBeatId);
      if (fromIdx === -1 || toIdx === -1) return;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, draggedBeat);
      onReorderBeats?.(targetActId, order);
    } else {
      // Cross-act move + insert at the target position
      onMoveBeat(draggedBeat, beat.actId, targetActId);
      const targetAct = plotBoard.acts.find((a) => a.id === targetActId);
      if (targetAct) {
        const newOrder = [...targetAct.beatIds.filter((b) => b !== draggedBeat), draggedBeat];
        const toIdx = newOrder.indexOf(targetBeatId);
        const moved = newOrder.filter((b) => b !== draggedBeat);
        moved.splice(toIdx, 0, draggedBeat);
        onReorderBeats?.(targetActId, moved);
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex gap-5 h-full min-w-max">
          {plotBoard.acts.map((act, i) => (
            <motion.div
              key={act.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`w-[300px] flex-shrink-0 flex flex-col bg-[var(--sidebar)] border border-[var(--border)] rounded-xl overflow-hidden max-h-full transition-colors ${
                dragOverAct === act.id ? 'ring-2 ring-[var(--accent)] bg-[var(--accent)]/5' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, act.id)}
              onDragLeave={() => setDragOverAct(null)}
              onDrop={(e) => handleDrop(e, act.id)}
            >
              {/* Act header */}
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel)]">
                <div className="flex items-center gap-2 flex-1">
                  <Layers className="w-4 h-4 text-[var(--accent)]" />
                  <input
                    value={act.title}
                    onChange={(e) => onUpdateAct(act.id, { title: e.target.value })}
                    className="bg-transparent text-sm font-bold text-[var(--accent)] uppercase tracking-wider outline-none flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)] bg-[var(--card)] px-2 py-0.5 rounded-full">
                    {act.beatIds.length}
                  </span>
                  <button
                    onClick={() => onDeleteAct(act.id)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Beats */}
              <div className="flex-1 overflow-y-auto p-3 min-h-[200px]">
                {act.beatIds.map((beatId) => {
                  const beat = beats[beatId];
                  if (!beat) return null;
                  return (
                    <BeatCard
                      key={beat.id}
                      beat={beat}
                      onUpdate={onUpdateBeat}
                      onDelete={onDeleteBeat}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isDragging={draggedBeat === beat.id}
                      autoFocus={beat.id === justAddedBeat}
                      isDropTarget={dragOverBeat === beat.id}
                      expanded={expandedBeat === beat.id}
                      onToggleExpand={() => setExpandedBeat((cur) => (cur === beat.id ? null : beat.id))}
                      onBeatDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBeat(beat.id); }}
                      onBeatDragLeave={() => setDragOverBeat((cur) => (cur === beat.id ? null : cur))}
                      onBeatDrop={(e) => handleBeatDrop(e, act.id, beat.id)}
                    />
                  );
                })}

                {act.beatIds.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                    <LayoutGrid className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p>No beats yet</p>
                  </div>
                )}
              </div>

              {/* Add beat button */}
              <div className="p-3 border-t border-[var(--border)]">
                <button
                  onClick={() => { const id = onAddBeat(act.id); if (id) setJustAddedBeat(id); }}
                  className="w-full py-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Beat
                </button>
              </div>
            </motion.div>
          ))}

          {/* Add act button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={onAddAct}
            className="w-[100px] flex-shrink-0 flex flex-col items-center justify-center gap-2 bg-transparent border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >
            <Plus className="w-6 h-6" />
            <span className="text-xs font-medium">Add Act</span>
          </motion.button>

          <BeatSheetPicker />
        </div>
      </div>
    </div>
  );
}

function BeatSheetPicker() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Apply a famous beat structure"
        className="w-[140px] flex-shrink-0 flex flex-col items-center justify-center gap-2 px-3 py-4 bg-[var(--accent-soft)] border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--accent)] hover:border-[var(--accent)] transition-all"
      >
        <Wand2 className="w-6 h-6" />
        <span className="text-xs font-bold whitespace-nowrap">Apply a Beat Sheet</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute top-full left-0 mt-2 w-72 z-50 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Choose a sheet</span>
              <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Close">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {BEAT_SHEETS.map((s) => (
                <button
                  key={s.id}
                  onClick={async () => {
                    if (!confirm(`Replace the current Plot board with the ${s.label} template? Your current beats and acts will be cleared.`)) return;
                    const { useAppStore } = await import('@/store/useAppStore');
                    const st = useAppStore.getState();
                    // Wipe acts + beats, then rebuild
                    useAppStore.setState({ beats: {}, plotBoard: { acts: [] } });
                    for (const act of s.acts) {
                      const actId = st.addAct();
                      useAppStore.getState().updateAct(actId, { title: act.title });
                      for (const b of act.beats) {
                        const beatId = useAppStore.getState().addBeat(actId);
                        useAppStore.getState().updateBeat(beatId, {
                          title: b.title,
                          description: b.hint,
                          beatType: b.beatType,
                        });
                      }
                    }
                    setOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2 hover:bg-[var(--hover)] border-t border-[var(--border)]"
                >
                  <div className="text-xs font-bold text-[var(--text)]">{s.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">{s.source} · {s.description}</div>
                </button>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BeatCard({
  beat,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  isDragging,
  autoFocus,
  isDropTarget,
  expanded,
  onToggleExpand,
  onBeatDragOver,
  onBeatDragLeave,
  onBeatDrop,
}: {
  beat: Beat;
  onUpdate: (id: string, updates: Partial<Beat>) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  autoFocus?: boolean;
  isDropTarget?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onBeatDragOver?: (e: React.DragEvent) => void;
  onBeatDragLeave?: () => void;
  onBeatDrop?: (e: React.DragEvent) => void;
}) {
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagValue, setTagValue] = useState('');

  const addTag = () => {
    if (tagValue.trim()) {
      onUpdate(beat.id, { tags: [...beat.tags, tagValue.trim()] });
      setTagValue('');
      setShowTagInput(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', beat.id);
    onDragStart(beat.id);
  };

  // Color comes from beat.color, but if beat has a beatType, prefer its color.
  const stripeColor = (beat.beatType && BEAT_TYPE_COLORS[beat.beatType]) || beat.color;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onBeatDragOver}
      onDragLeave={onBeatDragLeave}
      onDrop={onBeatDrop}
      onDoubleClick={onToggleExpand}
      className={`beat-card ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'ring-2 ring-[var(--accent)]/70' : ''}`}
      style={{ borderLeftWidth: '3px', borderLeftStyle: 'solid', borderLeftColor: stripeColor }}
    >
      <button
        onClick={() => onDelete(beat.id)}
        className="absolute top-2 right-2 p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-all"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="w-3 h-3 text-[var(--text-muted)] cursor-grab" />
        <input
          autoFocus={autoFocus}
          value={beat.title}
          onChange={(e) => onUpdate(beat.id, { title: e.target.value })}
          placeholder="Beat Title"
          className="flex-1 bg-transparent text-sm font-bold text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
        />
      </div>

      {/* Beat type picker */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {BEAT_TYPES.slice(0, expanded ? BEAT_TYPES.length : 6).map((t) => (
          <button
            key={t}
            onClick={() => onUpdate(beat.id, { beatType: t } as any)}
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider transition-all ${
              beat.beatType === t
                ? 'text-white shadow'
                : 'text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--accent)]'
            }`}
            style={beat.beatType === t ? { background: BEAT_TYPE_COLORS[t] } : undefined}
            title={`Set as ${t}`}
          >
            {t}
          </button>
        ))}
        {!expanded && (
          <button
            onClick={onToggleExpand}
            className="text-[9px] px-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
            title="Show all beat types"
          >
            +
          </button>
        )}
      </div>

      <textarea
        value={beat.description}
        onChange={(e) => onUpdate(beat.id, { description: e.target.value })}
        placeholder={expanded ? "Write your beat in detail — setup, conflict, escalation, outcome..." : "Description..."}
        className={`w-full bg-transparent text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none resize-y ${expanded ? 'min-h-[160px]' : 'min-h-[50px]'}`}
      />

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mt-2">
        {beat.tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--hover)] text-[var(--text-muted)] border border-[var(--border)]"
          >
            {tag}
            <button
              onClick={() => onUpdate(beat.id, { tags: beat.tags.filter((_, idx) => idx !== i) })}
              className="hover:text-[var(--danger)]"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        {!showTagInput ? (
          <button
            onClick={() => setShowTagInput(true)}
            className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--hover)] text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--bg)] transition-all flex items-center gap-1"
          >
            <Tag className="w-2.5 h-2.5" /> + tag
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
              onBlur={addTag}
              placeholder="Tag..."
              className="w-20 px-2 py-0.5 rounded-full text-[10px] bg-[var(--hover)] text-[var(--text)] border border-[var(--border)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        )}
      </div>
    </div>
  );
}
