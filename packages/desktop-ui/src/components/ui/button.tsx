import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.ts';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_3px_9px_rgba(80,77,137,.13)] hover:bg-primary/90',
        secondary:
          'border border-border bg-white text-foreground shadow-[0_1px_1px_rgba(24,24,24,.02)] hover:bg-accent dark:bg-[#3d3944] dark:text-foreground dark:hover:bg-accent',
        ghost: 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
        outline: 'border border-border bg-transparent text-foreground hover:bg-accent',
        destructive: 'border border-destructive/20 bg-transparent text-destructive hover:bg-destructive/5',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-[10px] px-3 text-xs',
        lg: 'h-11 px-5 text-sm',
        icon: 'size-10 rounded-xl',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
