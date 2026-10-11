import * as React from 'react';
import { cn } from '../../lib/utils.ts';

export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn('rounded-[20px] border border-border bg-card shadow-[0_7px_32px_rgba(43,38,48,.035)]', className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1.5 px-6 pt-6', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn('text-[15px] font-semibold tracking-[-.03em] text-foreground', className)}
      {...props}
    />
  );
}
export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-[13px] leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}
export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6 pb-6', className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex flex-wrap items-center gap-2 border-t border-border px-6 py-4', className)}
      {...props}
    />
  );
}
