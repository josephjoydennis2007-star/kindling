import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Image as ImageIcon, Music, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import type { Asset, AssetKind } from '@/types';

/**
 * Per-story asset library. Images, audio, references. Drag any image asset
 * into a shot's storyboard slot (it sets the storyboard data URL).
 */
// Stable empty-array reference. Returning `[]` inline from a Zustand
// selector creates a NEW array on every render, which fails Object.is
// comparison and forces a re-render on EVERY store update — that, combined
// with downstream effects, was triggering React error #185 ("Maximum update
// depth exceeded") when the user opened Assets. Sharing one frozen array
// breaks the cycle.
const EMPTY_ASSETS: Asset[] = [];

export default function AssetsPanel({ onClose }: { onClose: () => void }) {
  const assets = useAppStore((s) => (s.screenplay.assets ?? EMPTY_ASSETS) as Asset[]);
  const addAsset = useAppStore((s) => s.addAsset);
  const deleteAsset = useAppStore((s) => s.deleteAsset);
  const [filter, setFilter] = useState<'all' | AssetKind>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return assets.slice().reverse();
    return assets.filter((a) => a.kind === filter).reverse();
  }, [assets, filter]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const kind: AssetKind = file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('audio/') ? 'audio'
        : 'reference';
      const reader = new FileReader();
      reader.onload = () => {
        addAsset({ name: file.name, kind, data: reader.result as string, size: file.size });
      };
      reader.readAsDataURL(file);
    });
    toast.success(`Added ${files.length} asset${files.length !== 1 ? 's' : ''}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h3 className="text-xs uppercase tracking-widest text-[var(--text-secondary)] font-bold flex items-center gap-2">
          <ImageIcon className="w-4 h-4" /> Assets ({assets.length})
        </h3>
        <button onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-1 px-3 py-2 border-b border-[var(--border)] bg-[var(--sidebar)]">
        {(['all', 'image', 'audio', 'reference'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-2 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold ${
              filter === k
                ? 'bg-[var(--accent)] text-[var(--bg)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2">
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-10 text-xs text-[var(--text-muted)]">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No assets yet. Drop files below to upload.
          </div>
        )}
        {filtered.map((a) => (
          <div
            key={a.id}
            draggable={a.kind === 'image'}
            onDragStart={(e) => {
              if (a.kind !== 'image') return;
              // Pass the data URL so storyboard drop targets can read it
              e.dataTransfer.setData('text/uri-list', a.data);
              e.dataTransfer.setData('application/x-kindling-asset', a.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className="relative group bg-[var(--card)] border border-[var(--border)] rounded-md overflow-hidden"
          >
            {a.kind === 'image' && (
              <img src={a.data} alt={a.name} className="w-full h-24 object-cover" />
            )}
            {a.kind === 'audio' && (
              <div className="h-24 flex items-center justify-center bg-[var(--accent-soft)]">
                <Music className="w-8 h-8 text-[var(--text-secondary)]" />
              </div>
            )}
            {a.kind === 'reference' && (
              <div className="h-24 flex items-center justify-center bg-[var(--accent-soft)]">
                <FileText className="w-8 h-8 text-[var(--text-secondary)]" />
              </div>
            )}
            <div className="p-2">
              <div className="text-[10px] text-[var(--text)] truncate font-medium">{a.name}</div>
              <div className="text-[9px] text-[var(--text-muted)]">{Math.round(a.size / 1024)} KB</div>
            </div>
            <button
              onClick={() => deleteAsset(a.id)}
              className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500"
              title="Delete asset"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-[var(--border)]">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,audio/*,application/pdf,text/*"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-110"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload files
        </button>
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5 text-center">
          Drag images into a shot's storyboard slot to set it.
        </p>
      </div>
    </motion.div>
  );
}
