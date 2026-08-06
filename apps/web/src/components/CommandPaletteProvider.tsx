import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { CommandPalette, CommandItem } from './ui/command-palette';

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  addItems: (items: CommandItem[]) => void;
  removeItems: (ids: string[]) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export function CommandPaletteProvider({ children }: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<CommandItem[]>([]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const addItems = useCallback((newItems: CommandItem[]) => {
    setItems((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const itemsToAdd = newItems.filter((item) => !existingIds.has(item.id));
      return [...prev, ...itemsToAdd];
    });
  }, []);

  const removeItems = useCallback((ids: string[]) => {
    const idsSet = new Set(ids);
    setItems((prev) => prev.filter((item) => !idsSet.has(item.id)));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const contextValue: CommandPaletteContextValue = {
    open,
    close,
    addItems,
    removeItems,
  };

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <CommandPalette
        open={isOpen}
        onClose={close}
        items={items}
      />
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  }
  return context;
}

export type { CommandItem };
