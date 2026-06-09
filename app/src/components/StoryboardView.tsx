import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, Upload, Image as ImageIcon, Filter, Grid3x3, ExternalLink, Film, Maximize2, Plus, X, ImagePlus, Play, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import type { Shot } from '@/types';
import { sendPromptToRunway } from '@/lib/sendToRunway';
import { viewMedia } from '@/lib/mediaViewer';

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
  const bRolls = useAppStore((s) => s.bRolls);
  const updateShot = useAppStore((s) => s.updateShot);
  const addBRoll = useAppStore((s) => s.addBRoll);
  const updateBRoll = useAppStore((s) => s.updateBRoll);
  const deleteBRoll = useAppStore((s) => s.deleteBRoll);
  const [sceneFilter, setSceneFilter] = useState<string | 'all'>('all');
  const [columns, setColumns] = useState<3 | 4 | 5>(4);
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetShotId, setTargetShotId] = useState<string | null>(null);
  const brollFileRef = useRef<HTMLInputElement>(null);
  const [targetBRollId, setTargetBRollId] = useState<string | null>(null);

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

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const shotId = targetShotId;
    if (!file || !shotId) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files');
      return;
    }
    // Upload to cloud Storage; store only the URL (keeps the story light).
    const tid = toast.loading('Uploading frame to cloud…');
    try {
      const { uploadFileToCloud, currentStoryId } = await import('@/lib/mediaUpload');
      const url = await uploadFileToCloud(file, currentStoryId());
      updateShot(shotId, { storyboard: url });
      toast.success('Frame saved to cloud', { id: tid });
    } catch {
      toast.error('Upload failed', { id: tid });
    }
  };

  // ── B-roll, right from the storyboard (no need to open the Director) ──
  const triggerBRollUpload = (bRollId: string) => {
    setTargetBRollId(bRollId);
    brollFileRef.current?.click();
  };
  const handleBRollFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const brId = targetBRollId;
    if (!file || !brId) return;
    if (!file.type.startsWith('image/')) { toast.error('Only image files'); return; }
    const tid = toast.loading('Uploading b-roll frame to cloud…');
    try {
      const { uploadFileToCloud, currentStoryId } = await import('@/lib/mediaUpload');
      const url = await uploadFileToCloud(file, currentStoryId());
      updateBRoll(brId, { frame: url });
      toast.success('B-roll frame saved to cloud', { id: tid });
    } catch {
      toast.error('Upload failed', { id: tid });
    }
  };
  const brollPrompt = (description: string) => {
    const d = (description || '').trim() || 'atmospheric cutaway detail';
    return `Cinematic b-roll cutaway: ${d}. Photoreal, 16:9, shallow depth of field, atmospheric lighting, film grain.`;
  };

  // Attach / replace a shot's VIDEO by pasting a hosted link (e.g. a Runway
  // result). The video then shows in the storyboard in place of the frame.
  const addVideoUrl = (shotId: string, existing?: string | null) => {
    const url = window.prompt('Paste the video link (a hosted URL, e.g. your Runway result):', existing || '');
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      toast.error('That doesn’t look like a link', { description: 'Paste a URL starting with http(s):// — a hosted video link.' });
      return;
    }
    updateShot(shotId, { video: trimmed || null });
    toast.success(trimmed ? 'Video added to shot' : 'Video removed');
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
              <figure key={shot.id} className="group relative flex flex-col bg-[var(--card)] border border-[var(--rule)] rounded-xl overflow-hidden transition-all hover:border-[var(--accent)]/50 hover:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.55)]">
                {/* ── Frame / Video ── */}
                <div className="aspect-video bg-[var(--bg)] relative">
                  {shot.video ? (
                    /* VIDEO MODE — the video fills the frame; the first/last
                       frame images become small thumbnails over it. */
                    <>
                      <video
                        src={shot.video}
                        poster={shot.storyboard || undefined}
                        muted
                        playsInline
                        preload="metadata"
                        onClick={() => viewMedia(shot.video!, 'video', `Shot ${index} · ${sceneName}`)}
                        className="w-full h-full object-cover cursor-pointer"
                        title="Click to play full size"
                      />
                      {/* Play badge */}
                      <button
                        onClick={() => viewMedia(shot.video!, 'video', `Shot ${index} · ${sceneName}`)}
                        title="Play video"
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <span className="p-2.5 rounded-full bg-black/55 text-white group-hover:bg-black/75 transition-colors"><Play className="w-5 h-5" fill="currentColor" /></span>
                      </button>
                      {/* First / last frame thumbnails over the video — click to view image */}
                      <div className="absolute top-2 right-2 z-20 flex gap-1">
                        {shot.storyboard && (
                          <button onClick={(e) => { e.stopPropagation(); viewMedia(shot.storyboard!, 'image', `Shot ${index} · first frame`); }} title="First frame — click to view"
                            className="relative w-12 h-8 rounded overflow-hidden border-2 border-white/80 shadow cursor-zoom-in hover:scale-105 transition-transform">
                            <img src={shot.storyboard} alt="first frame" className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[6px] uppercase tracking-wider text-center font-bold leading-tight">1st</span>
                          </button>
                        )}
                        {shot.lastFrame && (
                          <button onClick={(e) => { e.stopPropagation(); viewMedia(shot.lastFrame!, 'image', `Shot ${index} · last frame`); }} title="Last frame — click to view"
                            className="relative w-12 h-8 rounded overflow-hidden border-2 border-white/80 shadow cursor-zoom-in hover:scale-105 transition-transform">
                            <img src={shot.lastFrame} alt="last frame" className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[6px] uppercase tracking-wider text-center font-bold leading-tight">last</span>
                          </button>
                        )}
                      </div>
                      {/* Change / remove video on hover */}
                      <div className="absolute inset-x-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center gap-2 p-2 pointer-events-none bg-gradient-to-t from-black/70 to-transparent">
                        <button onClick={() => addVideoUrl(shot.id, shot.video)} className="pointer-events-auto px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--accent)] text-[var(--accent-ink)]">Change video</button>
                        <button onClick={() => updateShot(shot.id, { video: null })} className="pointer-events-auto px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--danger)]/80 text-white">Remove video</button>
                      </div>
                    </>
                  ) : shot.storyboard ? (
                    <>
                      <img
                        src={shot.storyboard}
                        alt=""
                        onClick={() => viewMedia(shot.storyboard!, 'image', `Shot ${index} · ${sceneName}`)}
                        className="w-full h-full object-cover cursor-zoom-in"
                        title="Click to view full size"
                      />
                      {/* Small expand icon — click to view full size (sits above the image, top-right). */}
                      <button
                        onClick={() => viewMedia(shot.storyboard!, 'image', `Shot ${index} · ${sceneName}`)}
                        title="View full size"
                        className="absolute top-2 right-2 z-20 p-1.5 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      {/* Hover layer: Replace/Remove (centered). pointer-events-none
                          so it never blocks the image click underneath. */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/45 flex items-center justify-center gap-2 pointer-events-none">
                        <button onClick={() => triggerUpload(shot.id)} className="pointer-events-auto px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--accent)] text-[var(--accent-ink)]">Replace</button>
                        <button onClick={() => clearFrame(shot.id)} className="pointer-events-auto px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--danger)]/80 text-white">Remove</button>
                      </div>
                      {/* last frame thumbnail (first→last transition) */}
                      {shot.lastFrame ? (
                        <button onClick={() => viewMedia(shot.lastFrame!, 'image', `Shot ${index} · last frame`)} title="Last frame — click to view full size"
                          className="absolute bottom-2 right-2 w-16 h-11 rounded-md overflow-hidden border-2 border-white/80 shadow-lg cursor-zoom-in z-10 hover:scale-105 transition-transform">
                          <img src={shot.lastFrame} alt="last frame" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[7px] uppercase tracking-wider text-center font-bold leading-tight">last</span>
                        </button>
                      ) : shot.needsLastFrame ? (
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-[var(--accent)]/90 text-white" title={shot.lastFrameDescription || 'Needs a last frame'}>
                          + last
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <button
                      onClick={() => triggerUpload(shot.id)}
                      className="w-full h-full flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Upload className="w-5 h-5" />
                      <span className="text-[10px] uppercase tracking-widest font-bold">Upload / generate</span>
                    </button>
                  )}
                  {/* sequence number (always) */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/70 text-white tabular-nums backdrop-blur-sm z-20">
                    {String(index).padStart(2, '0')}
                  </div>
                  {/* shot-type chip (always) */}
                  {shot.shotType && (
                    <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-[var(--accent)] text-[var(--accent-ink)] shadow z-20">
                      {shot.shotType}
                    </div>
                  )}
                </div>

                {/* ── Caption ── */}
                <figcaption className="p-2.5 flex flex-col flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] truncate">{sceneName}</span>
                    {shot.lens && <span className="text-[9px] text-[var(--text-muted)] flex-shrink-0">{shot.lens}</span>}
                  </div>
                  {/* Editable directing note — "what happens in this frame". */}
                  <textarea
                    defaultValue={shot.description || ''}
                    onBlur={(e) => updateShot(shot.id, { description: e.target.value })}
                    placeholder="Direction — what happens in this frame…"
                    className="w-full min-h-[42px] resize-y bg-transparent text-[11px] leading-snug text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none border border-transparent focus:border-[var(--accent)]/40 rounded-md px-1.5 py-1 transition-colors"
                  />
                  {/* ── B-roll, fully editable right here in the storyboard ── */}
                  {(() => {
                    const brs = (shot.bRollIds || []).map((id) => bRolls[id]).filter(Boolean);
                    return (
                      <div className="mt-2 pt-2 border-t border-[var(--rule)]/60">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[8.5px] uppercase tracking-widest text-[var(--info)] font-bold flex items-center gap-1"><Film className="w-2.5 h-2.5" /> B-roll{brs.length ? ` · ${brs.length}` : ''}</div>
                          <button
                            onClick={() => { const id = addBRoll(shot.id); if (id) toast.success('B-roll added'); }}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-[var(--info)] hover:bg-[var(--info)]/10 transition-colors"
                            title="Add a b-roll / cutaway to this shot"
                          >
                            <Plus className="w-2.5 h-2.5" /> Add
                          </button>
                        </div>
                        {brs.length === 0 ? (
                          <span className="text-[9px] text-[var(--text-muted)]">No b-roll yet — click “Add” to create a cutaway, then generate its image/video here.</span>
                        ) : (
                          <div className="space-y-2">
                            {brs.map((b) => (
                              <div key={b.id} className="flex gap-2 bg-[var(--bg)] border border-[var(--rule)] rounded-md p-1.5">
                                {/* Frame: thumbnail (click to view) or upload */}
                                {b.frame ? (
                                  <button onClick={() => viewMedia(b.frame!, 'image', `B-roll · ${b.description || sceneName}`)} title="Click to view full size"
                                    className="relative w-14 h-10 flex-shrink-0 rounded overflow-hidden border border-[var(--info)]/50 hover:border-[var(--info)] cursor-zoom-in group/brf">
                                    <img src={b.frame} alt="b-roll" className="w-full h-full object-cover" />
                                    <span className="absolute inset-0 bg-black/0 group-hover/brf:bg-black/30 flex items-center justify-center transition-colors">
                                      <Maximize2 className="w-3 h-3 text-white opacity-0 group-hover/brf:opacity-100" />
                                    </span>
                                  </button>
                                ) : (
                                  <button onClick={() => triggerBRollUpload(b.id)} title="Upload a b-roll frame"
                                    className="w-14 h-10 flex-shrink-0 rounded border border-dashed border-[var(--border)] hover:border-[var(--info)] hover:text-[var(--info)] text-[var(--text-muted)] flex flex-col items-center justify-center transition-colors">
                                    <ImagePlus className="w-3 h-3" />
                                    <span className="text-[7px] uppercase tracking-wider font-bold">Frame</span>
                                  </button>
                                )}
                                {/* Description + generate buttons */}
                                <div className="flex-1 min-w-0">
                                  <input
                                    defaultValue={b.description || ''}
                                    onBlur={(e) => updateBRoll(b.id, { description: e.target.value })}
                                    placeholder="B-roll: cutaway / insert…"
                                    className="w-full bg-transparent text-[10px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] outline-none border-b border-transparent focus:border-[var(--info)]/50 pb-0.5"
                                  />
                                  <div className="flex items-center gap-1 mt-1">
                                    <button
                                      onClick={() => sendPromptToRunway({ prompt: brollPrompt(b.description), shotLabel: `B-roll · ${(b.description || '').slice(0, 24) || 'cutaway'}`, target: 'image' })}
                                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                                      title="Generate this b-roll frame in Runway"
                                    >
                                      <ExternalLink className="w-2 h-2" /> Image
                                    </button>
                                    <button
                                      onClick={() => sendPromptToRunway({ prompt: brollPrompt(b.description), shotLabel: `B-roll · ${(b.description || '').slice(0, 24) || 'cutaway'}`, target: 'video', imageUrls: b.frame ? [b.frame] : [] })}
                                      disabled={!b.frame}
                                      title={b.frame ? 'Animate this b-roll frame in Runway' : 'Add a frame first'}
                                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <Film className="w-2 h-2" /> Video
                                    </button>
                                    {b.frame && (
                                      <button onClick={() => triggerBRollUpload(b.id)} className="px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold text-[var(--text-muted)] hover:text-[var(--accent)]" title="Replace frame">Replace</button>
                                    )}
                                    <button onClick={() => deleteBRoll(b.id)} className="ml-auto p-0.5 text-[var(--text-muted)] hover:text-[var(--danger)]" title="Delete b-roll"><X className="w-2.5 h-2.5" /></button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* Generate buttons */}
                  <div className="mt-auto pt-2 flex gap-1">
                    <button
                      onClick={() => sendPromptToRunway({ prompt: buildRunwayPrompt(shot, sceneName), shotId: shot.id, shotLabel: `${sceneName} · ${shot.shotType || 'shot'}`, target: 'image' })}
                      title="Generate this frame in Runway"
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md text-[9px] uppercase tracking-wider font-bold bg-[var(--bg)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" /> Image
                    </button>
                    <button
                      onClick={() => sendPromptToRunway({ prompt: buildRunwayPrompt(shot, sceneName), shotId: shot.id, shotLabel: `${sceneName} · ${shot.shotType || 'shot'}`, target: 'video', imageUrls: [shot.storyboard, shot.lastFrame].filter(Boolean) as string[] })}
                      disabled={!shot.storyboard}
                      title={shot.storyboard ? 'Animate this frame in Runway' : 'Add a frame first'}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md text-[9px] uppercase tracking-wider font-bold bg-[var(--bg)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Film className="w-2.5 h-2.5" /> Video
                    </button>
                    <button
                      onClick={() => addVideoUrl(shot.id, shot.video)}
                      title="Paste a finished video link (e.g. your Runway result) to show it on this shot"
                      className="flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md text-[9px] uppercase tracking-wider font-bold bg-[var(--bg)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                    >
                      <Link2 className="w-2.5 h-2.5" /> {shot.video ? 'Edit link' : 'Add video'}
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
      <input
        ref={brollFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleBRollFile}
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
