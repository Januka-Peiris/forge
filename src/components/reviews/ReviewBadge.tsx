import type { ReactNode } from 'react';

interface ReviewBadgeProps {
  tone: 'neutral' | 'green' | 'yellow' | 'red' | 'blue';
  children: ReactNode;
}

export function ReviewBadge({ tone, children }: ReviewBadgeProps) {
  const classes = {
    neutral: 'border-mn-border bg-mn-surface-overlay text-mn-muted',
    green: 'border-mn-cyan/25 bg-mn-cyan/10 text-mn-cyan',
    yellow: 'border-mn-yellow/25 bg-mn-yellow/10 text-mn-yellow',
    red: 'border-mn-red/25 bg-mn-red/10 text-mn-red',
    blue: 'border-mn-blue/25 bg-mn-blue/10 text-mn-blue',
  }[tone];

  return (
    <span className={`rounded-full border px-2 py-0.5 text-ui-caption font-semibold ${classes}`}>
      {children}
    </span>
  );
}
