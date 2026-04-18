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
          'bg-forge-orange/10 border border-forge-orange/30 text-forge-orange hover:bg-forge-orange/20',
        secondary:
          'bg-white/5 border border-forge-border text-forge-muted hover:bg-white/10 hover:text-forge-text',
        outline:
          'border border-forge-border bg-transparent text-forge-muted hover:bg-white/5 hover:text-forge-text',
        ghost:
          'text-forge-muted hover:bg-white/5 hover:text-forge-text',
        destructive:
          'bg-forge-red/10 border border-forge-red/30 text-forge-red hover:bg-forge-red/20',
        warning:
          'bg-forge-yellow/10 border border-forge-yellow/30 text-forge-yellow hover:bg-forge-yellow/20',
        success:
          'bg-forge-green/10 border border-forge-green/30 text-forge-green hover:bg-forge-green/20',
        link:
          'text-forge-orange underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 py-1.5 text-xs rounded-md',
        sm: 'h-7 px-2.5 py-1 text-xs rounded-md',
        xs: 'h-6 px-2 py-0.5 text-[11px] rounded',
        lg: 'h-9 px-4 py-2 text-sm rounded-lg',
        icon: 'h-8 w-8 rounded-md',
        'icon-sm': 'h-7 w-7 rounded-md',
        'icon-xs': 'h-6 w-6 rounded',
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
