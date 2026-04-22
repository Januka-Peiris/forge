import * as React from 'react';
import { cn } from '../../lib/cn';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex w-full rounded-chat border border-forge-border bg-forge-bg px-3 py-2 text-sm leading-relaxed text-forge-text placeholder:text-forge-muted',
        'focus:border-forge-orange/40 focus:outline-none focus:ring-1 focus:ring-forge-orange/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'resize-none',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
