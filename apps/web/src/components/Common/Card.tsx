import React from 'react';

/**
 * Card: Reusable container component for content grouping
 * 
 * Variants: default, outlined, filled
 * Supports padding, shadows, and hover effects
 * 
 * WCAG: Semantic article/section structure
 */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'filled';
  padding?: 'sm' | 'md' | 'lg';
  shadow?: boolean;
  children: React.ReactNode;
}

export function Card({
  variant = 'default',
  padding = 'md',
  shadow = true,
  className = '',
  children,
  ...props
}: CardProps) {
  const variantClasses = {
    default: 'bg-white border border-gray-300',
    outlined: 'bg-transparent border-2 border-gray-300',
    filled: 'bg-gray-50 border border-gray-200',
  };

  const paddingClasses = {
    sm: 'p-3',
    md: 'p-6',
    lg: 'p-8',
  };

  const shadowClass = shadow ? 'shadow-sm hover:shadow-md transition-shadow' : '';

  return (
    <article
      className={`rounded-lg ${variantClasses[variant]} ${paddingClasses[padding]} ${shadowClass} ${className}`}
      {...props}
    >
      {children}
    </article>
  );
}
