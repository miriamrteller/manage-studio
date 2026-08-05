import * as React from 'react';
import { cn } from '@/lib/utils';

interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
}

function makeTypographyComponent(
  defaultTag: React.ElementType,
  textClass: string,
  displayName: string
) {
  const Component = React.forwardRef<HTMLElement, TypographyProps>(
    ({ className, as, ...props }, ref) => {
      const Tag = as ?? defaultTag;
      return React.createElement(Tag, {
        ref,
        className: cn(textClass, className),
        ...props,
      });
    }
  );
  Component.displayName = displayName;
  return Component;
}

export const Display = makeTypographyComponent('h1', 'text-display', 'Display');
export const H1 = makeTypographyComponent('h1', 'text-h1', 'H1');
export const H2 = makeTypographyComponent('h2', 'text-h2', 'H2');
export const H3 = makeTypographyComponent('h3', 'text-h3', 'H3');
export const H4 = makeTypographyComponent('h4', 'text-h4', 'H4');
export const BodyLarge = makeTypographyComponent('p', 'text-body-lg', 'BodyLarge');
export const Body = makeTypographyComponent('p', 'text-body', 'Body');
export const BodySmall = makeTypographyComponent('p', 'text-body-sm', 'BodySmall');
export const Caption = makeTypographyComponent('span', 'text-caption', 'Caption');
