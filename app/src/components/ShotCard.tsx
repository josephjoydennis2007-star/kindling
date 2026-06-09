import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  GripVertical,
  Plus,
  Trash2,
  Film,
  X,
  Camera,
  ImagePlus,
} from 'lucide-react';
import type { Shot, BRoll, Character, ShotType } from '@/types';
import { viewMedia } from '@/lib/mediaViewer';
import { uploadFileToCloud, currentStoryId } from '@/lib/mediaUpload';
import { sendPromptToRunway } from '@/lib/sendToRunway';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

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

/** A single storyboard frame slot (first or last). Shows the image with a
 *  remove button when set, or an upload affordance when empty. Accepts both
 *  file uploads and AssetsPanel image drags (text/uri-list). */
function FrameSlot({
  label,
  value,
  accent,
  onSet,
  onClear,
}: {
  label: string;
  value?: string | null;
  accent?: boolean;
  onSet: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      className="min-w-[120px]"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-kindling-asset')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const uri = e.dataTransfer.getData('text/uri-list');
        if (uri) {
          e.preventDefault();
          onSet(uri);
        }
      }}
    >
      <div className={`text-[9px] uppercase tracking-wider font-bold mb-1 ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
        {label}
      </div>
      {value ? (
        <div className="relative inline-block group/img">
          <img
            src={value}
            alt={label}
            loading="lazy"
            decoding="async"
            onClick={() => viewMedia(value!, 'image', label)}
            className="max-h-28 rounded-lg border border-[var(--border)] object-cover cursor-zoom-in"
            title="Click to view full size"
          />
          <button
            onClick={onClear}
            className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover/img:opacity-100 hover:bg-red-500 transition-opacity"
            title={`Remove ${label.toLowerCase()}`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <label className={`inline-flex items-center gap-1.5 px-2 py-1 bg-[var(--card)] border border-dashed rounded-md text-[10px] cursor-pointer transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] ${accent ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
          <ImagePlus className="w-3 h-3" />
          Add {label.toLowerCase()}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              // Upload to cloud Storage and store only the URL — keeps the story
              // light (no base64 in RAM/disk). Falls back to a data URL if the
              // cloud isn't reachable.
              const tid = toast.loading('Uploading image to cloud…');
              try {
                const url = await uploadFileToCloud(file, currentStoryId());
                onSet(url);
                toast.success('Image saved to cloud', { id: tid });
              } catch {
                toast.error('Upload failed', { id: tid });
              }
            }}
          />
        </label>
      )}
    </div>
  );
}

/** A concise Runway prompt for a b-roll cutaway. */
function brollRunwayPrompt(description: string): string {
  const d = (description || '').trim() || 'atmospheric cutaway detail';
  return `Cinematic b-roll cutaway: ${d}. Photoreal, 16:9, shallow depth of field, atmospheric lighting, film grain.`;
}

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
  // Reveal the "last frame" slot when the shot already has one, when Claude
  // flagged it as a first→last transition, or when the user opens it manually.
  const [showLast, setShowLast] = useState<boolean>(!!(shot.lastFrame || shot.needsLastFrame));
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

        {/* Camera / movement + lens + duration */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Camera className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
          <input
            defaultValue={shot.camera}
            onBlur={(e) => onUpdate(shot.id, { camera: e.target.value })}
            placeholder="Camera & movement (e.g. dolly in, handheld)"
            className="flex-1 min-w-[120px] bg-transparent border-none text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          <input
            defaultValue={shot.lens || ''}
            onBlur={(e) => onUpdate(shot.id, { lens: e.target.value } as any)}
            placeholder="Lens"
            title="Lens (e.g. 35mm)"
            className="w-20 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[11px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            min={0}
            step={0.5}
            defaultValue={shot.durationSec || ''}
            onBlur={(e) => onUpdate(shot.id, { durationSec: Number(e.target.value) || 0 } as any)}
            placeholder="0s"
            title="Duration in seconds"
            className="w-16 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[11px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] text-right"
          />
        </div>

        {/* Storyboard frames — First frame + optional Last frame. Each slot
            is also a drop target for AssetsPanel image drags. The last frame
            drives Runway first→last-frame video generation. */}
        <div className="mt-3">
          <div className="flex gap-4 items-start flex-wrap">
            <FrameSlot
              label="First frame"
              value={shot.storyboard}
              onSet={(v) => onUpdate(shot.id, { storyboard: v } as any)}
              onClear={() => onUpdate(shot.id, { storyboard: null } as any)}
            />
            {(showLast || shot.lastFrame || shot.needsLastFrame) ? (
              <FrameSlot
                label="Last frame"
                accent={!!shot.needsLastFrame && !shot.lastFrame}
                value={shot.lastFrame}
                onSet={(v) => onUpdate(shot.id, { lastFrame: v } as any)}
                onClear={() => onUpdate(shot.id, { lastFrame: null } as any)}
              />
            ) : (
              <button
                onClick={() => setShowLast(true)}
                title="Add a last frame for a first→last transition (e.g. to generate a Runway video between two frames)."
                className="mt-5 inline-flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] border border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-md transition-colors"
              >
                <Plus className="w-3 h-3" /> Add last frame
              </button>
            )}
          </div>
          {shot.needsLastFrame && (
            <div className="mt-1.5 text-[10px] text-[var(--accent)] font-medium">
              ✦ This shot is a first→last transition{shot.lastFrameDescription ? ` — last frame: ${shot.lastFrameDescription}` : ''}
            </div>
          )}
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
                {/* B-roll frame image — upload + click-to-view, same as a shot frame. */}
                <FrameSlot
                  label="B-roll frame"
                  value={br.frame}
                  onSet={(v) => onUpdateBRoll(br.id, { frame: v })}
                  onClear={() => onUpdateBRoll(br.id, { frame: null })}
                />
                <div className="flex-1">
                  <textarea
                    autoFocus={br.id === justAddedBRoll}
                    defaultValue={br.description}
                    onBlur={(e) => onUpdateBRoll(br.id, { description: e.target.value })}
                    placeholder="B-roll description: cutaways, inserts, stock footage..."
                    className="w-full min-h-[40px] bg-transparent border-none text-xs text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none resize-y"
                  />
                  {/* Send this b-roll to Runway — image or video, with its frame as reference. */}
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() => sendPromptToRunway({ prompt: brollRunwayPrompt(br.description), shotLabel: `B-roll · ${(br.description || '').slice(0, 30) || 'cutaway'}`, target: 'image' })}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] uppercase tracking-wider font-bold bg-[var(--panel)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                      title="Generate this b-roll frame in Runway"
                    >
                      <ExternalLink className="w-2.5 h-2.5" /> Image
                    </button>
                    <button
                      onClick={() => sendPromptToRunway({ prompt: brollRunwayPrompt(br.description), shotLabel: `B-roll · ${(br.description || '').slice(0, 30) || 'cutaway'}`, target: 'video', imageUrls: br.frame ? [br.frame] : [] })}
                      disabled={!br.frame}
                      title={br.frame ? 'Animate this b-roll frame in Runway' : 'Add a b-roll frame first'}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] uppercase tracking-wider font-bold bg-[var(--panel)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Film className="w-2.5 h-2.5" /> Video
                    </button>
                  </div>
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

      {/* FrameSlot rendered above */}
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
