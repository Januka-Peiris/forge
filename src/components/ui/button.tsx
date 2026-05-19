import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-mn-orange/10 border border-mn-orange/30 text-mn-orange hover:bg-mn-orange/20',
        secondary:
          'bg-white/5 border border-mn-border text-mn-muted hover:bg-white/10 hover:text-mn-text',
        outline:
          'border border-mn-border bg-transparent text-mn-muted hover:bg-white/5 hover:text-mn-text',
        ghost:
          'text-mn-muted hover:bg-white/5 hover:text-mn-text',
        destructive:
          'bg-mn-red/10 border border-mn-red/30 text-mn-red hover:bg-mn-red/20',
        warning:
          'bg-mn-yellow/10 border border-mn-yellow/30 text-mn-yellow hover:bg-mn-yellow/20',
        success:
          'bg-mn-green/10 border border-mn-green/30 text-mn-green hover:bg-mn-green/20',
        link:
          'text-mn-orange underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 py-1.5 text-xs rounded-btn',
        sm: 'h-7 px-2.5 py-1 text-xs rounded-btn',
        xs: 'h-6 px-2 py-0.5 text-[11px] rounded-btn',
        lg: 'h-9 px-4 py-2 text-sm rounded-btn',
        icon: 'h-8 w-8 rounded-btn',
        'icon-sm': 'h-7 w-7 rounded-btn',
        'icon-xs': 'h-6 w-6 rounded-btn',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };
