import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'flex h-11 w-full min-w-0 rounded-[11px] border border-input bg-card px-3.5 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
