import { motion } from 'framer-motion';
import { Users, Plus } from 'lucide-react';
import type { Character } from '@/types';

interface CharacterBarProps {
  characters: Character[];
  onCharacterClick: () => void;
  onAddCharacter: () => void;
}

export default function CharacterBar({ characters, onCharacterClick, onAddCharacter }: CharacterBarProps) {
  return (
    <div className="character-bar">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mr-2 flex-shrink-0">
        <Users className="w-3.5 h-3.5" />
        Characters
      </div>
      <div className="flex-1 overflow-x-auto flex items-center gap-2 no-scrollbar">
        {characters.map((char, i) => (
          <motion.button
            key={char.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={onCharacterClick}
            className="char-chip group"
          >
            <div
              className="chip-avatar"
              style={{ background: char.image ? 'transparent' : char.color }}
            >
              {char.image ? (
                <img src={char.image} alt={char.name} />
              ) : (
                char.name.charAt(0)
              )}
            </div>
            <span className="chip-name">{char.name}</span>
          </motion.button>
        ))}
      </div>
      <button
        onClick={onAddCharacter}
        className="flex items-center gap-1 px-3 py-2 border-2 border-dashed border-[var(--border)] rounded-full text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex-shrink-0"
      >
        <Plus className="w-3.5 h-3.5" /> Add
      </button>
    </div>
  );
}
