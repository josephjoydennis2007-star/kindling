import { Save, Wifi, FileText, Hash, Clock } from 'lucide-react';
import type { Screenplay, Scene } from '@/types';

interface StatusBarProps {
  screenplay: Screenplay;
  scenes: Scene[];
  onSave: () => void;
}

export default function StatusBar({ screenplay, scenes, onSave }: StatusBarProps) {
  let words = 0;
  try {
    const text = screenplay.elements.map(el => {
      const div = document.createElement('div');
      div.innerHTML = el.content;
      return div.textContent || '';
    }).join(' ');
    words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  } catch {
    words = 0;
  }
  const pages = Math.max(1, Math.ceil(screenplay.elements.length / 55));

  return (
    <div className="status-bar">
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          {words} words
        </span>
        <span className="flex items-center gap-1.5">
          <Hash className="w-3 h-3" />
          {pages} page{pages !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[var(--success)]">
          <Wifi className="w-3 h-3" />
          Local
        </span>
        <button
          onClick={onSave}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-[var(--hover)] transition-colors text-[var(--accent)]"
        >
          <Save className="w-3 h-3" />
          Save
        </button>
      </div>
    </div>
  );
}
