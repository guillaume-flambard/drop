import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils.ts';

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex h-10 items-center gap-1 rounded-xl bg-accent p-1 text-muted-foreground', className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-8 items-center rounded-lg px-3.5 text-xs font-medium transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm focus-visible:outline-2 focus-visible:outline-primary',
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;
