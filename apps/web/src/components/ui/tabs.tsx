import React, { createContext, useContext, useMemo, useState } from 'react';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within Tabs');
  }
  return context;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ children, value, onValueChange, defaultValue = '', className = '', ...props }, ref) => {
    const [internalValue, setInternalValue] = useState(defaultValue);
    const isControlled = value !== undefined;
    const activeValue = isControlled ? value : internalValue;

    const contextValue = useMemo(
      () => ({
        value: activeValue,
        onValueChange: (next: string) => {
          if (!isControlled) {
            setInternalValue(next);
          }
          onValueChange?.(next);
        },
      }),
      [activeValue, isControlled, onValueChange],
    );

    return (
      <TabsContext.Provider value={contextValue}>
        <div ref={ref} className={className} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);

Tabs.displayName = 'Tabs';

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={`flex gap-1 border-b border-gray-200 ${className}`}
      {...props}
    />
  ),
);

TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className = '', value, onClick, ...props }, ref) => {
    const { value: activeValue, onValueChange } = useTabsContext();
    const isActive = activeValue === value;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        data-state={isActive ? 'active' : 'inactive'}
        // Straight underline (no radius), overlapping the list's own border; the
        // active colour is the AA-safe brand ink. Works the same in RTL.
        className={`-mb-px rounded-none border-b-2 px-4 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary-ink)] ${
          isActive
            ? 'border-[var(--color-primary-ink)] text-[var(--color-primary-ink)]'
            : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
        } ${className}`}
        onClick={(event) => {
          onValueChange(value);
          onClick?.(event);
        }}
        {...props}
      />
    );
  },
);

TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className = '', value, ...props }, ref) => {
    const { value: activeValue } = useTabsContext();
    if (activeValue !== value) {
      return null;
    }

    return (
      <div ref={ref} role="tabpanel" className={className} {...props} />
    );
  },
);

TabsContent.displayName = 'TabsContent';
