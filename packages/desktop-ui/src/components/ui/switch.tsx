import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../lib/utils.ts';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'relative inline-flex h-[23px] w-[41px] shrink-0 rounded-full bg-[#d9d8de] transition-colors data-[state=checked]:bg-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[19px] translate-x-[2px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.15)] transition-transform data-[state=checked]:translate-x-[20px]" />
    </SwitchPrimitive.Root>
  );
}
