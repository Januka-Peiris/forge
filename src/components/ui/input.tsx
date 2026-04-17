import * as React from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-8 w-full rounded-md border border-forge-border bg-forge-bg px-3 py-1.5 text-xs text-forge-text placeholder:text-forge-dim',
        'focus:border-forge-orange/40 focus:outline-none focus:ring-1 focus:ring-forge-orange/20',
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
