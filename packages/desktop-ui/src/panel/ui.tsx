/** Small building blocks of the menu bar panel, on top of the shared shadcn/ui components and design tokens. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '../components/ui/button.tsx';
import { cn } from '../lib/utils.ts';
import { initials } from './logic.ts';

export interface PanelActions {
  /** Shows a result banner, focuses it, and announces it through the live region. */
  info: (text: string) => void;
  /** Shows a refusal in an alert banner, focused, with its translated code. */
  fail: (text: string) => void;
  /** Announces without a banner, e.g. « Lien copié. ». */
  announce: (text: string) => void;
  /** Moves the focus to the control marked `data-focus={key}` once it is rendered. */
  focusTo: (key: string) => void;
  /** Reloads the requests, the badge and the header state. */
  refreshRequests: () => void;
}

export const PanelContext = createContext<PanelActions>({
  info: () => undefined,
  fail: () => undefined,
  announce: () => undefined,
  focusTo: () => undefined,
  refreshRequests: () => undefined,
});

export function usePanel(): PanelActions {
  return useContext(PanelContext);
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      tabIndex={-1}
      className={cn(
        'mx-0.5 mt-2 text-[11.5px] font-semibold tracking-[.01em] text-muted-foreground outline-none first:mt-0',
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mx-0.5 text-[12px] leading-relaxed text-muted-foreground">{children}</p>;
}

export function Avatar({ name, accent = 1 }: { name: string; accent?: 0 | 1 | 2 | 3 }) {
  return (
    <span
      aria-hidden="true"
      data-accent={accent}
      className="soft-avatar grid size-8 shrink-0 place-items-center rounded-[10px] text-[11px] font-semibold tracking-[-.02em]"
    >
      {initials(name)}
    </span>
  );
}

/** A grouped list, rows separated by hairlines, like a Mac inset list. */
export function List({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div
      aria-label={label}
      role={label ? 'group' : undefined}
      className={cn(
        'panel-surface divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-[12px] leading-snug text-muted-foreground', className)}>{children}</div>;
}

export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-[11px] text-muted-foreground tabular-nums', className)}>{children}</div>;
}

export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div id={id} className="text-[12px] leading-snug text-destructive">
      {children}
    </div>
  );
}

export function Dot({ tone }: { tone: 'ok' | 'wait' | 'bad' | 'idle' }) {
  const colors = {
    ok: 'bg-[#4a9b79] dark:bg-[#7fcaa5]',
    wait: 'bg-[#c9954f] dark:bg-[#e3bd84]',
    bad: 'bg-destructive',
    idle: 'bg-muted-foreground/60',
  };
  return <span aria-hidden="true" className={cn('inline-block size-[7px] shrink-0 rounded-full', colors[tone])} />;
}

/** Placeholder blocks while a section loads; the hidden text is for VoiceOver. */
export function Loading() {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="sr-only">Chargement…</span>
      <div className="panel-breathe h-16 rounded-2xl bg-muted" />
      <div className="panel-breathe h-16 rounded-2xl bg-muted" />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="panel-surface flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-5 py-6 text-center">
      {icon}
      <strong className="text-[13px] font-semibold text-foreground">{title}</strong>
      <Muted className="max-w-[270px]">{children}</Muted>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-foreground">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const LOAD_FAILED = 'Impossible de charger cette section. Vérifie que drop est ouvert, puis réessaie.';

/** The load failure of a tab: an alert, announced, with a way to try again. */
export function SectionError({ retry }: { retry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-2xl border border-destructive/40 px-3.5 py-3 text-[12px] text-foreground"
    >
      <div>{LOAD_FAILED}</div>
      <Button variant="secondary" size="sm" onClick={retry}>
        <RotateCw aria-hidden="true" />
        Réessayer
      </Button>
    </div>
  );
}

/**
 * Loads a tab's data each time the tab becomes active, and on demand. A late answer from an older load never
 * overwrites a newer one.
 */
export function useSection<T>(
  load: () => Promise<T>,
  active: boolean,
): { data: T | null; failed: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const version = useRef(0);
  const loader = useRef(load);
  loader.current = load;
  const reload = useCallback(() => {
    const mine = ++version.current;
    setFailed(false);
    loader.current().then(
      (value) => {
        if (mine === version.current) setData(value);
      },
      () => {
        if (mine === version.current) setFailed(true);
      },
    );
  }, []);
  useEffect(() => {
    if (active) reload();
  }, [active, reload]);
  return { data, failed, reload };
}

/** Compact sizes of the shared Input and Textarea for a 380-px popover. */
export const compactInput = 'h-9 rounded-[10px] px-3 text-[13px] aria-[invalid=true]:border-destructive';
export const compactTextarea =
  'min-h-[96px] rounded-[10px] px-3 py-2 text-[13px] aria-[invalid=true]:border-destructive';
export const compactSelect =
  'h-9 w-full rounded-[10px] border border-input bg-card px-2.5 text-[13px] text-foreground outline-none focus-visible:border-primary/60';
