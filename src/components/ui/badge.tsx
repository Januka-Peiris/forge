import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-forge-border bg-white/5 text-forge-muted',
        muted:
          'border-transparent bg-white/5 text-forge-dim',
        success:
          'border-forge-green/25 bg-forge-green/10 text-forge-green',
        warning:
          'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow',
        destructive:
          'border-forge-red/25 bg-forge-red/10 text-forge-red',
        info:
          'border-forge-blue/25 bg-forge-blue/10 text-forge-blue',
        orange:
          'border-forge-orange/25 bg-forge-orange/10 text-forge-orange',
        violet:
          'border-forge-violet/25 bg-forge-violet/10 text-forge-violet',
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
            variant === 'success' && 'bg-forge-green',
            variant === 'warning' && 'bg-forge-yellow',
            variant === 'destructive' && 'bg-forge-red',
            variant === 'info' && 'bg-forge-blue',
            variant === 'orange' && 'bg-forge-orange',
            (!variant || variant === 'default' || variant === 'muted') && 'bg-forge-muted',
          )}
        />
      )}
      {children}
    </span>
  );
}

export { Badge };
