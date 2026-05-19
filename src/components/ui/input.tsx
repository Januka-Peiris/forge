import * as React from 'react';
import { cn } from '../../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-8 w-full rounded-input border border-mn-border bg-mn-bg px-3 py-1.5 text-xs text-mn-text placeholder:text-mn-dim',
        'focus:border-mn-orange/40 focus:outline-none focus:ring-1 focus:ring-mn-orange/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
