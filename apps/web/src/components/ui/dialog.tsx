import React from 'react';

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export const Dialog = ({ open = false, children }: DialogProps) => (
  <div>{open && children}</div>
);

export const DialogTrigger = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <button onClick={onClick}>{children}</button>
);

export const DialogContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className={`bg-white rounded-lg p-6 mx-4 w-full ${className ?? 'max-w-sm'}`}>{children}</div>
  </div>
);

export const DialogHeader = ({ children }: { children: React.ReactNode; className?: string }) => (
  <div className="mb-4">{children}</div>
);

export const DialogTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-lg font-semibold">{children}</h2>
);

export const DialogDescription = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-gray-600">{children}</p>
);
