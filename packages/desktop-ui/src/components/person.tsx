import { cn } from '../lib/utils.ts';
import { initials } from '../lib/format.ts';

interface PersonLineProps {
  name: string;
  description?: string;
  online?: boolean;
  accent?: 0 | 1 | 2 | 3;
  size?: 'sm' | 'md';
}
export function PersonLine({ name, description, online, accent = 0, size = 'md' }: PersonLineProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        data-accent={accent}
        aria-hidden="true"
        className={cn(
          'soft-avatar grid shrink-0 place-items-center rounded-[13px] font-semibold tracking-[-.02em]',
          size === 'md' ? 'size-10 text-xs' : 'size-9 text-[11px]',
        )}
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <span className="truncate">{name}</span>
          {online === true ? <span className="jade-dot" aria-label="En ligne" /> : null}
        </span>
        {description ? (
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </div>
  );
}
