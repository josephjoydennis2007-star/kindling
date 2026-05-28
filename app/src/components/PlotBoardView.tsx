import { useState } from 'react';
import { motion } from 'framer-motion';
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
}

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
}: PlotBoardViewProps) {
  const [draggedBeat, setDraggedBeat] = useState<string | null>(null);
  const [dragOverAct, setDragOverAct] = useState<string | null>(null);
  const [justAddedBeat, setJustAddedBeat] = useState<string | null>(null);

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
    if (!draggedBeat) return;

    const beat = beats[draggedBeat];
    if (!beat || beat.actId === targetActId) {
      setDragOverAct(null);
      return;
    }

    onMoveBeat(draggedBeat, beat.actId, targetActId);
    setDragOverAct(null);
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
        </div>
      </div>
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
}: {
  beat: Beat;
  onUpdate: (id: string, updates: Partial<Beat>) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  autoFocus?: boolean;
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

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className={`beat-card ${isDragging ? 'dragging' : ''}`}
      style={{ borderLeftWidth: '3px', borderLeftStyle: 'solid', borderLeftColor: beat.color }}
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

      <textarea
        value={beat.description}
        onChange={(e) => onUpdate(beat.id, { description: e.target.value })}
        placeholder="Description..."
        className="w-full min-h-[50px] bg-transparent text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none resize-y"
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
