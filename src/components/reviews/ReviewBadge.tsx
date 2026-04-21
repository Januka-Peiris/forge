import type { ReactNode } from 'react';

interface ReviewBadgeProps {
  tone: 'neutral' | 'green' | 'yellow' | 'red' | 'blue';
  children: ReactNode;
}

export function ReviewBadge({ tone, children }: ReviewBadgeProps) {
  const classes = {
    neutral: 'border-forge-border bg-forge-surface-overlay text-forge-muted',
    green: 'border-forge-green/25 bg-forge-green/10 text-forge-green',
    yellow: 'border-forge-yellow/25 bg-forge-yellow/10 text-forge-yellow',
    red: 'border-forge-red/25 bg-forge-red/10 text-forge-red',
    blue: 'border-forge-blue/25 bg-forge-blue/10 text-forge-blue',
  }[tone];

  return (
    <span className={`rounded-full border px-2 py-0.5 text-ui-caption font-semibold ${classes}`}>
      {children}
    </span>
  );
}
