import React from 'react';

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ value, onValueChange, children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )
);

Tabs.displayName = 'Tabs';

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`flex space-x-1 border-b border-gray-200 ${className}`}
      {...props}
    />
  )
);

TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`px-4 py-2 font-medium border-b-2 border-transparent hover:border-gray-300 ${className}`}
      {...props}
    />
  )
);

TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className = '', ...props }, ref) => (
    <div ref={ref} className={className} {...props} />
  )
);

TabsContent.displayName = 'TabsContent';
