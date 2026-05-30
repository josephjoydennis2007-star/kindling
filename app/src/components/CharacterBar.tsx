import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import type { Character } from '@/types';

interface CharacterBarProps {
  characters: Character[];
  /** Called with the clicked character's id so the right panel can open
   *  directly on that character's profile. Falls back to the panel-only
   *  toggle when no character is passed. */
  onCharacterClick: (id: string) => void;
  /** Kept in the props so callers don't have to change — adding a character
   *  is now exclusively the job of the FloatingActionButton (which already
   *  has a much more prominent "+ Character" affordance in the bottom-right
   *  corner). The redundant dashed "Add" pill here was sitting BEHIND the
   *  FAB and confused users — removed. */
  onAddCharacter?: () => void;
  onOpenAllCharacters?: () => void;
}

export default function CharacterBar({ characters, onCharacterClick, onOpenAllCharacters }: CharacterBarProps) {
  return (
    <div className="character-bar">
      <button
        onClick={() => onOpenAllCharacters?.()}
        title="Open Characters panel"
        className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mr-2 flex-shrink-0 hover:text-[var(--accent)] transition-colors"
      >
        <Users className="w-3.5 h-3.5" />
        Characters
        <span className="text-[9px] text-[var(--text-muted)]">({characters.length})</span>
      </button>
      <div className="flex-1 overflow-x-auto flex items-center gap-2 no-scrollbar">
        {characters.map((char, i) => (
          <motion.button
            key={char.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onCharacterClick(char.id)}
            className="char-chip group"
            title={`Open ${char.name}'s profile`}
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
    </div>
  );
}
