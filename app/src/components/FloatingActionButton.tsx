import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';

interface FABAction {
  id: string;
  label: string;
  icon: any;
  color: string;
  onClick: () => void;
}

interface FloatingActionButtonProps {
  actions: FABAction[];
  isFocusMode?: boolean;
}

export default function FloatingActionButton({ actions, isFocusMode }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (isFocusMode) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="relative">
        {/* Action buttons */}
        <AnimatePresence>
          {isOpen && (
            <div className="absolute bottom-16 right-0 space-y-2">
              {actions.map((action, idx) => (
                <motion.button
                  key={action.id}
                  initial={{ opacity: 0, scale: 0.8, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => {
                    action.onClick();
                    setIsOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-full backdrop-blur-md ${action.color} shadow-lg hover:shadow-xl transition-all whitespace-nowrap`}
                  title={action.label}
                >
                  <action.icon className="w-4 h-4" />
                  <span className="text-xs font-semibold hidden sm:inline">{action.label}</span>
                </motion.button>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Main FAB button. Sanctioned gradient #3 — fills accent → accent-pair
            on hover. Solid accent when idle so it reads correctly at rest. */}
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="fab-gradient w-14 h-14 rounded-full text-[var(--accent-ink)] shadow-lg hover:shadow-xl flex items-center justify-center transition-all"
        >
          <motion.div
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <Plus className="w-6 h-6" />
          </motion.div>
        </motion.button>
      </div>
    </div>
  );
}
