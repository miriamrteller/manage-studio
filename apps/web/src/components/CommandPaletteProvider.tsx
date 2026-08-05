import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CommandPalette, type CommandItem } from '@/components/ui/command-palette';

export interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Registers commands. Re-registering the same id replaces the entry. */
  addItems: (items: CommandItem[]) => void;
  removeItems: (ids: string[]) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export interface CommandPaletteProviderProps {
  children: React.ReactNode;
  /** Commands that are always available, independent of the current route. */
  staticItems?: CommandItem[];
  placeholder?: string;
  label?: string;
}

/**
 * CommandPaletteProvider: owns palette state and the global ⌘K / Ctrl+K
 * shortcut, and lets any screen contribute route-specific commands.
 *
 * Notes
 * - `addItems` de-duplicates by id (last registration wins) so a screen that
 *   re-registers on every render — or remounts under React 18 StrictMode's
 *   double-invoked effects — cannot pile up duplicate commands. The draft's
 *   plain append would have grown the list without bound.
 * - The keydown listener is registered once and ignores repeats. The shortcut
 *   is honoured even from inside a text field, which is the expected behaviour
 *   for a command palette.
 * - Cleanup on unmount removes the listener.
 *
 * Usage: wrap the app shell once, then from any screen:
 *   const { addItems, removeItems } = useCommandPalette();
 *   useEffect(() => {
 *     addItems(items);
 *     return () => removeItems(items.map(i => i.id));
 *   }, [addItems, removeItems, items]);
 */
export function CommandPaletteProvider({
  children,
  staticItems,
  placeholder,
  label,
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<CommandItem[]>([]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);

  const addItems = useCallback((newItems: CommandItem[]) => {
    setItems((current) => {
      const merged = new Map(current.map((item) => [item.id, item]));
      for (const item of newItems) merged.set(item.id, item);
      return Array.from(merged.values());
    });
  }, []);

  const removeItems = useCallback((ids: string[]) => {
    setItems((current) => {
      const drop = new Set(ids);
      return current.filter((item) => !drop.has(item.id));
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen((current) => !current);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const allItems = useMemo(
    () => [...(staticItems ?? []), ...items],
    [staticItems, items],
  );

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ isOpen, open, close, toggle, addItems, removeItems }),
    [isOpen, open, close, toggle, addItems, removeItems],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        open={isOpen}
        onClose={close}
        items={allItems}
        placeholder={placeholder}
        label={label}
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
export default CommandPaletteProvider;
