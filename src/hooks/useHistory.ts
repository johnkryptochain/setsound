import { useState, useCallback, useEffect } from 'react';

interface UseHistoryProps<T> {
  initialState: T;
  maxHistory?: number;
}

export const useHistory = <T,>({ initialState, maxHistory = 50 }: UseHistoryProps<T>) => {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const current = history[currentIndex];
  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const push = useCallback((newState: T) => {
    setHistory(prev => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, currentIndex + 1);
      // Add new state
      newHistory.push(newState);
      // Limit history size
      if (newHistory.length > maxHistory) {
        newHistory.shift();
        setCurrentIndex(newHistory.length - 1);
      } else {
        setCurrentIndex(newHistory.length - 1);
      }
      return newHistory;
    });
  }, [currentIndex, maxHistory]);

  const undo = useCallback(() => {
    if (canUndo) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [canRedo]);

  const reset = useCallback((newInitialState: T) => {
    setHistory([newInitialState]);
    setCurrentIndex(0);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return {
    current,
    push,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
    historyLength: history.length,
    currentIndex
  };
};