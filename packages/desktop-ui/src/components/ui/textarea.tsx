import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-[112px] w-full resize-y rounded-[11px] border border-input bg-card px-3.5 py-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/20',
        className,
      )}
      {...props}
    />
  );
}
