import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  GripVertical,
  Plus,
  Trash2,
  Film,
  X,
  Camera,
} from 'lucide-react';
import type { Shot, BRoll, Character, ShotType } from '@/types';

const SHOT_TYPES: ShotType[] = [
  'WIDE',
  'MEDIUM',
  'CLOSE-UP',
  'EXTREME CLOSE-UP',
  'OVER-THE-SHOULDER',
  'POV',
  'ESTABLISHING',
  'INSERT',
  'AERIAL',
];

interface ShotCardProps {
  shot: Shot;
  index: number;
  bRolls: Record<string, BRoll>;
  characters: Character[];
  autoFocus?: boolean;
  onUpdate: (id: string, updates: Partial<Shot>) => void;
  onDelete: (id: string) => void;
  onAddBRoll: (shotId: string) => string;
  onUpdateBRoll: (id: string, updates: Partial<BRoll>) => void;
  onDeleteBRoll: (id: string) => void;
  onDragStart: (shotId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, targetShotId: string) => void;
  isDragging: boolean;
}

export default function ShotCard({
  shot,
  index,
  bRolls,
  autoFocus,
  onUpdate,
  onDelete,
  onAddBRoll,
  onUpdateBRoll,
  onDeleteBRoll,
  onDragStart,
  onDragEnd,
  onDragOver,
  isDragging,
}: ShotCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [justAddedBRoll, setJustAddedBRoll] = useState<string | null>(null);
  const shotBRolls = shot.bRollIds.map(id => bRolls[id]).filter(Boolean);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', shot.id);
    onDragStart(shot.id);
  };

  const addBRoll = () => {
    const id = onAddBRoll(shot.id);
    if (id) setJustAddedBRoll(id);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, shot.id)}
      className={`shot-card ${isDragging ? 'dragging' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--card)] border-b border-[var(--border)]">
        <GripVertical className="w-4 h-4 text-[var(--text-muted)] cursor-grab flex-shrink-0" />
        <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg)] flex items-center justify-center text-sm font-bold flex-shrink-0">
          {index + 1}
        </div>
        <select
          value={shot.shotType}
          onChange={(e) => onUpdate(shot.id, { shotType: e.target.value as ShotType | '' })}
          className="bg-[var(--panel)] border border-[var(--border)] rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)] cursor-pointer"
        >
          <option value="">Shot type…</option>
          {SHOT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex-1" />
        <button
          onClick={addBRoll}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--info)] hover:bg-[var(--hover)] rounded-lg transition-all"
        >
          <Plus className="w-3 h-3" /> B-Roll
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--hover)] rounded-lg transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        <textarea
          autoFocus={autoFocus}
          defaultValue={shot.description}
          onBlur={(e) => onUpdate(shot.id, { description: e.target.value })}
          placeholder="Describe the shot: framing, movement, focus, action..."
          className="w-full min-h-[60px] bg-transparent border-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none resize-y"
        />

        {/* Camera / movement */}
        <div className="flex items-center gap-2 mt-2">
          <Camera className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
          <input
            defaultValue={shot.camera}
            onBlur={(e) => onUpdate(shot.id, { camera: e.target.value })}
            placeholder="Camera & movement (e.g. dolly in, handheld, 35mm)"
            className="flex-1 bg-transparent border-none text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none"
          />
        </div>

        {/* B-Rolls */}
        {shotBRolls.length > 0 && (
          <div className="mt-4 pl-4 border-l-2 border-[var(--border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--info)] font-bold mb-2 flex items-center gap-1">
              <Film className="w-3 h-3" /> B-Roll
            </div>
            {shotBRolls.map(br => (
              <div
                key={br.id}
                className="flex items-start gap-2 mb-2 bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border)]"
              >
                <div className="flex-1">
                  <textarea
                    autoFocus={br.id === justAddedBRoll}
                    defaultValue={br.description}
                    onBlur={(e) => onUpdateBRoll(br.id, { description: e.target.value })}
                    placeholder="B-roll description: cutaways, inserts, stock footage..."
                    className="w-full min-h-[40px] bg-transparent border-none text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none resize-y"
                  />
                </div>
                <button
                  onClick={() => onDeleteBRoll(br.id)}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl z-10"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div className="bg-[var(--panel)] p-4 rounded-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-[var(--text)] mb-3">Delete this shot?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-xs bg-[var(--card)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(shot.id); setShowDeleteConfirm(false); }}
                className="px-3 py-1.5 text-xs bg-[var(--danger)] text-white rounded-lg hover:brightness-110"
              >
                Delete
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
