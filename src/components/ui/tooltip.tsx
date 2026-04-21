import * as React from 'react';
import { cn } from '../../lib/cn';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {React.cloneElement(children, { ref: triggerRef })}
      {open && (
        <div
          ref={tooltipRef}
          className={cn(
            'absolute z-[100] px-2 py-1 text-[10px] font-medium text-white bg-forge-card border border-forge-border rounded shadow-forge-panel whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95 duration-100',
            sideClasses[side],
            className
          )}
        >
          {content}
          <div 
            className={cn(
              'absolute w-1.5 h-1.5 bg-forge-card border-b border-r border-forge-border transform rotate-45',
              side === 'top' && 'bottom-[-0.75px] left-1/2 -translate-x-1/2 border-t-0 border-l-0',
              side === 'bottom' && 'top-[-0.75px] left-1/2 -translate-x-1/2 border-b-0 border-r-0 rotate-[225deg]',
              side === 'left' && 'right-[-0.75px] top-1/2 -translate-y-1/2 border-l-0 border-b-0 rotate-[-45deg]',
              side === 'right' && 'left-[-0.75px] top-1/2 -translate-y-1/2 border-r-0 border-t-0 rotate-[135deg]',
            )}
          />
        </div>
      )}
    </div>
  );
}
