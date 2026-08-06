import React from 'react';
import { Command } from 'cmdk';
import { ReactNode, useEffect, useRef } from 'react';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  onSelect: () => void;
  keywords?: string[];
  group?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
}

export function CommandPalette({
  open,
  onClose,
  items,
  placeholder = 'Search...',
}: CommandPaletteProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target === overlayRef.current) {
        onClose();
      }
    }
  };

  if (!open) return null;

  const groupedItems = items.reduce<Record<string, CommandItem[]>>((acc, item) => {
    const group = item.group || 'ungrouped';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(item);
    return acc;
  }, {});

  const groups = Object.keys(groupedItems);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="button"
      tabIndex={0}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '20vh',
        zIndex: 9999,
      }}
    >
      <Command
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: '640px',
          backgroundColor: 'var(--surface-overlay)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        <Command.Input
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            border: 'none',
            borderBottom: '1px solid var(--border-default)',
            backgroundColor: 'transparent',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
        <Command.List
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '8px',
          }}
        >
          <Command.Empty
            style={{
              padding: '16px',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            No results found.
          </Command.Empty>

          {groups.map((group) => (
            <Command.Group
              key={group}
              heading={group !== 'ungrouped' ? group : undefined}
              style={{
                padding: '4px 0',
              }}
            >
              {group !== 'ungrouped' && (
                <div
                  style={{
                    padding: '8px 12px 4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {group}
                </div>
              )}
              {groupedItems[group].map((item) => (
                <Command.Item
                  key={item.id}
                  value={[item.label, item.description, ...(item.keywords || [])].filter(Boolean).join(' ')}
                  onSelect={() => {
                    item.onSelect();
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: 'var(--color-text-primary)',
                  }}
                  className="command-item"
                >
                  {item.icon && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        color: 'var(--color-primary)',
                      }}
                    >
                      {item.icon}
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {item.label}
                    </div>
                    {item.description && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--color-text-secondary)',
                          marginTop: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.description}
                      </div>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
      <style>{`
        .command-item[data-selected="true"],
        .command-item:hover {
          background-color: var(--state-hover);
        }
      `}</style>
    </div>
  );
}