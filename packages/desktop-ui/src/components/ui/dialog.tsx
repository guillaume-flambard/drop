import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#24222c]/35 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-32px)] max-w-[520px] max-h-[min(88vh,760px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border border-border bg-card p-7 shadow-[0_26px_100px_rgba(27,23,35,.17)] focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Fermer"
          className="absolute top-5 right-5 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X size={16} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-5 space-y-2 pr-8', className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-xl font-semibold tracking-[-.045em] text-foreground', className)}
      {...props}
    />
  );
}
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-[13px] leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mt-6 flex flex-wrap justify-end gap-2', className)} {...props} />;
}
