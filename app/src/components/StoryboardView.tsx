import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, Upload, Image as ImageIcon, Filter, Grid3x3, ExternalLink, Film } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import type { Shot } from '@/types';
import { sendPromptToRunway } from '@/lib/sendToRunway';

/**
 * StoryboardView — a full-page grid of every storyboard image across all
 * scenes and shots. Director can scan the whole visual flow at once,
 * upload missing frames, or filter by scene.
 *
 * Distinct from the per-shot board inside DirectorView's shot list, which
 * shows one image at a time.
 */
export default function StoryboardView() {
  const scenes = useAppStore((s) => s.scenes);
  const shots = useAppStore((s) => s.shots);
  const updateShot = useAppStore((s) => s.updateShot);
  const [sceneFilter, setSceneFilter] = useState<string | 'all'>('all');
  const [columns, setColumns] = useState<3 | 4 | 5>(4);
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetShotId, setTargetShotId] = useState<string | null>(null);

  // Flatten shots into a sequence ordered by their scene order.
  // shots is a Record<id, Shot> in the store; resolve via scene.shotIds.
  const sequence = useMemo(() => {
    const out: { sceneName: string; sceneId: string; shot: Shot; index: number }[] = [];
    let idx = 0;
    for (const sc of scenes) {
      if (sceneFilter !== 'all' && sc.id !== sceneFilter) continue;
      const scShots: Shot[] = (sc.shotIds || [])
        .map((id) => (shots as Record<string, Shot>)[id])
        .filter(Boolean);
      for (const sh of scShots) {
        out.push({ sceneName: sc.name, sceneId: sc.id, shot: sh, index: ++idx });
      }
    }
    return out;
  }, [scenes, shots, sceneFilter]);

  const triggerUpload = (shotId: string) => {
    setTargetShotId(shotId);
    fileRef.current?.click();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !targetShotId) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateShot(targetShotId, { storyboard: reader.result as string });
      toast.success('Frame uploaded');
    };
    reader.readAsDataURL(file);
  };

  const clearFrame = (shotId: string) => {
    if (!confirm('Remove this storyboard frame?')) return;
    updateShot(shotId, { storyboard: '' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full overflow-y-auto"
    >
      <div className="px-6 py-4 border-b border-[var(--rule)] sticky top-0 bg-[var(--bg)] z-10 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Clapperboard className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
          <h1 className="text-sm font-display font-bold text-[var(--text)]">Storyboard</h1>
          <span className="text-xs text-[var(--text-muted)]">·</span>
          <span className="text-xs text-[var(--text-muted)]">{sequence.length} frame{sequence.length === 1 ? '' : 's'}</span>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <select
            value={sceneFilter}
            onChange={(e) => setSceneFilter(e.target.value)}
            className="bg-[var(--card)] border border-[var(--rule)] rounded-md px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All scenes</option>
            {scenes.map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 bg-[var(--card)] border border-[var(--rule)] rounded-md px-1 py-0.5">
          <Grid3x3 className="w-3 h-3 text-[var(--text-muted)] mx-1" />
          {([3, 4, 5] as const).map((c) => (
            <button
              key={c}
              onClick={() => setColumns(c)}
              className={`text-[10px] font-bold w-5 h-5 rounded transition-colors ${
                columns === c ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
              title={`${c} columns`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {sequence.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No shots yet. Add scenes + shots in the Director view to fill the board.</p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {sequence.map(({ sceneName, shot, index }) => (
              <figure key={shot.id} className="bg-[var(--card)] border border-[var(--rule)] rounded-md overflow-hidden group">
                <div className="aspect-video bg-[var(--bg)] relative">
                  {shot.storyboard ? (
                    <img src={shot.storyboard} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <button
                      onClick={() => triggerUpload(shot.id)}
                      className="w-full h-full flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Upload className="w-5 h-5" />
                      <span className="text-[10px] uppercase tracking-widest font-bold">Upload frame</span>
                    </button>
                  )}
                  {shot.storyboard && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 flex items-center justify-center gap-2">
                      <button
                        onClick={() => triggerUpload(shot.id)}
                        className="px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--accent)] text-[var(--accent-ink)]"
                      >
                        Replace
                      </button>
                      <button
                        onClick={() => clearFrame(shot.id)}
                        className="px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--danger)]/80 text-white"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-black/60 text-white tabular-nums">
                    {String(index).padStart(3, '0')}
                  </div>
                </div>
                <figcaption className="p-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] truncate">{sceneName}</div>
                  <div className="text-xs text-[var(--text)] truncate font-medium">
                    {shot.shotType || 'Shot'} {shot.lens ? `· ${shot.lens}` : ''}
                  </div>
                  {shot.description && (
                    <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                      {shot.description}
                    </div>
                  )}
                  {/* Send-to-Runway buttons. Image button always shown,
                      video button only when a still already exists
                      (since Runway image_to_video needs a source frame). */}
                  <div className="mt-2 flex gap-1">
                    <button
                      onClick={() => sendPromptToRunway({
                        prompt: buildRunwayPrompt(shot, sceneName),
                        shotId: shot.id,
                        shotLabel: `${sceneName} · ${shot.shotType || 'shot'}`,
                        target: 'image',
                      })}
                      title="Copy this shot's prompt + open Runway. Free if you use Explore mode."
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[9px] uppercase tracking-wider font-bold bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Image
                    </button>
                    <button
                      onClick={() => sendPromptToRunway({
                        prompt: buildRunwayPrompt(shot, sceneName),
                        shotId: shot.id,
                        shotLabel: `${sceneName} · ${shot.shotType || 'shot'}`,
                        target: 'video',
                      })}
                      disabled={!shot.storyboard}
                      title={shot.storyboard ? 'Send to Runway video. Free in Explore mode.' : 'Generate or upload an image first.'}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[9px] uppercase tracking-wider font-bold bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Film className="w-2.5 h-2.5" />
                      Video
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </motion.div>
  );
}

/**
 * Build a Runway-friendly prompt from a shot. We weave the scene name,
 * shot type, description, lens, and camera notes into a single concise
 * sentence the user can paste straight into Runway's text field.
 */
function buildRunwayPrompt(shot: Shot, sceneName: string): string {
  const bits: string[] = [];
  if (shot.shotType) bits.push(shot.shotType.toLowerCase());
  if (shot.description) bits.push(shot.description);
  bits.push(`scene: ${sceneName}`);
  if (shot.camera) bits.push(`camera: ${shot.camera}`);
  if (shot.lens) bits.push(`lens: ${shot.lens}`);
  return `Cinematic ${bits.join(', ')}. Photoreal, 16:9, atmospheric lighting, film grain.`;
}
