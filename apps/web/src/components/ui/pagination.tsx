import React from 'react';

export const Pagination = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <nav className={`flex justify-center items-center space-x-2 ${className}`}>{children}</nav>
);

export const PaginationContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const PaginationItem = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const PaginationLink = ({
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a className="px-3 py-1 border rounded hover:bg-gray-100" {...props}>
    {children}
  </a>
);

export const PaginationPrevious = ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a className="px-3 py-1 border rounded hover:bg-gray-100" {...props}>
    Previous
  </a>
);

export const PaginationNext = ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a className="px-3 py-1 border rounded hover:bg-gray-100" {...props}>
    Next
  </a>
);
