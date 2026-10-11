import * as React from 'react';
import { cn } from '../../lib/utils.ts';

type BadgeProps = React.ComponentProps<'span'> & { tone?: 'neutral' | 'success' | 'warning' | 'danger' };
export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  const tones = {
    neutral: 'bg-accent text-muted-foreground',
    success: 'bg-[#e9f4ed] text-[#326e54] dark:bg-[#234236] dark:text-[#a4d4bb]',
    warning: 'bg-[#faf0e5] text-[#926a43] dark:bg-[#49392c] dark:text-[#e3bd92]',
    danger: 'bg-[#f9eded] text-[#a35858] dark:bg-[#462d30] dark:text-[#f0abab]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
