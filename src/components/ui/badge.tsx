import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-mn-border bg-white/5 text-mn-muted',
        muted:
          'border-transparent bg-white/5 text-mn-dim',
        success:
          'border-mn-green/25 bg-mn-green/10 text-mn-green',
        warning:
          'border-mn-yellow/25 bg-mn-yellow/10 text-mn-yellow',
        destructive:
          'border-mn-red/25 bg-mn-red/10 text-mn-red',
        info:
          'border-mn-blue/25 bg-mn-blue/10 text-mn-blue',
        orange:
          'border-mn-orange/25 bg-mn-orange/10 text-mn-orange',
        violet:
          'border-mn-teal/25 bg-mn-teal/10 text-mn-teal',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  animateDot?: boolean;
}

function Badge({ className, variant, dot, animateDot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            animateDot && 'animate-agent-pulse',
            variant === 'success' && 'bg-mn-green',
            variant === 'warning' && 'bg-mn-yellow',
            variant === 'destructive' && 'bg-mn-red',
            variant === 'info' && 'bg-mn-blue',
            variant === 'orange' && 'bg-mn-orange',
            (!variant || variant === 'default' || variant === 'muted') && 'bg-mn-muted',
          )}
        />
      )}
      {children}
    </span>
  );
}

export { Badge };
