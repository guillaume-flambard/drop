/**
 * The consent card (T4.35), shared by the menu bar panel and the workspace window so that the two never diverge.
 * Purely visual: no API call, no context. Its state comes from `model.ts`; its actions go back through props.
 * While the request waits it shows exactly the content of the node spec (« Contenu exact de la carte de
 * consentement »); once decided, the countdown and the buttons give way to the state and what happened to the data.
 * Everything a peer wrote is rendered as React text, never as HTML.
 */
import type { ReactNode } from 'react';
import { Check, Clock3, Lock, ShieldAlert } from 'lucide-react';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { cn } from '../lib/utils.ts';
import { HIGH_SENSITIVITY, agentName, costLine, countdown } from '../panel/logic.ts';
import type { ApprovalItem } from '../panel/types.ts';
import { Avatar, Meta, Muted } from '../panel/ui.tsx';
import { blockedReason, stateCopy, waiting, type ConsentState, type Decision } from './model.ts';

export function ConsentCard({
  item,
  state,
  now,
  onDecide,
  onDismiss,
  children,
}: {
  item: ApprovalItem;
  state: ConsentState;
  now: number;
  onDecide: (decision: Decision) => void;
  onDismiss: () => void;
  /** « Répondre moi-même », shown under the buttons while the request waits. */
  children?: ReactNode;
}) {
  const who = item.requestedBy.displayName;
  const title = item.card.title;
  const cost = costLine(item.card, who);
  const headingId = 'card-' + item.dropId;
  const stateId = 'card-state-' + item.dropId;
  const reasonId = 'card-reason-' + item.dropId;
  const open = waiting(state);
  const blocked = blockedReason(state);
  const copy = stateCopy(state, who, item.card.sensitivity);
  const action = (decision: Decision, label: string) => ({
    'data-focus': item.dropId + ':' + decision,
    'aria-label': label + ' : ' + title,
    // Blocked, the button stays focusable and says why (WAI-ARIA APG, « Focusability of disabled controls »).
    'aria-disabled': blocked ? true : undefined,
    'aria-describedby': blocked ? reasonId : undefined,
    className: cn(blocked && 'cursor-default opacity-50'),
    onClick: () => {
      onDecide(decision);
    },
  });
  return (
    <article
      aria-labelledby={headingId}
      aria-describedby={open ? undefined : stateId}
      tabIndex={-1}
      data-slot="consent-card"
      data-state={state.kind}
      data-focus={item.dropId + ':card'}
      className="panel-surface motion-arrive flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <header className="flex items-center gap-2.5">
        <Avatar name={who} />
        <div className="min-w-0 flex-1">
          <div id={headingId} className="text-[13px] leading-snug">
            <span className="font-semibold break-words">{who}</span> a besoin d’aide
          </div>
          <Muted className="truncate">via {agentName(item.requestedBy.agent)}</Muted>
        </div>
      </header>
      <div className="text-[14px] leading-snug font-semibold tracking-[-.015em] break-words">{title}</div>
      <p className="selectable m-0 rounded-xl bg-muted px-3 py-2.5 text-[13.5px] leading-[1.45] break-words text-foreground">
        « {item.inputPreview} »
      </p>
      <p className="m-0 text-[12px] leading-relaxed break-words text-muted-foreground">
        <b className="font-semibold text-foreground">Pourquoi : </b>
        {item.purpose}
      </p>
      <div className="flex flex-col gap-2 border-t border-border pt-2.5">
        <Ledger icon="give" label={who + ' recevra :'} items={item.card.receives} />
        <Ledger icon="keep" label={who + ' ne recevra jamais :'} items={item.card.neverReceives} />
      </div>
      <div className="flex flex-col gap-1">
        {cost ? <Meta>{cost}</Meta> : null}
        {item.card.sensitivity === 'high' ? (
          <Meta className="flex items-center gap-1.5 text-[#926a43] dark:text-[#e3bd92]">
            <ShieldAlert aria-hidden="true" className="size-3.5" />
            {HIGH_SENSITIVITY}
          </Meta>
        ) : null}
        {open ? (
          <Meta className="flex items-center gap-1.5">
            <Clock3 aria-hidden="true" className="size-3.5" />
            <span>Expire dans {countdown(item.expiresAt, now)}</span>
          </Meta>
        ) : null}
      </div>
      {open ? (
        <>
          <div className="flex items-center gap-1.5 pt-0.5">
            <Button
              variant="ghost"
              size="sm"
              data-default-action={item.dropId}
              {...action('not_now', 'Reporter')}
              className={cn('mr-auto px-2', blocked && 'cursor-default opacity-50')}
            >
              Pas maintenant
            </Button>
            <Button variant="secondary" size="sm" {...action('deny', 'Refuser')}>
              Refuser
            </Button>
            <Button size="sm" {...action('allow_once', 'Autoriser une fois')}>
              Autoriser une fois
            </Button>
          </div>
          {blocked ? (
            <Meta className="-mt-1.5">
              <span id={reasonId}>{blocked}</span>
            </Meta>
          ) : null}
          {state.kind === 'pending' && state.notice ? (
            <div className="-mt-1.5 text-[12px] leading-snug break-words text-destructive">{state.notice}</div>
          ) : null}
          {children}
        </>
      ) : (
        <div id={stateId} className="flex flex-col items-start gap-1.5 border-t border-border pt-2.5">
          <Badge tone={copy.tone}>{copy.label}</Badge>
          <p className="m-0 text-[12.5px] leading-snug break-words">{copy.sentence}</p>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-1 px-2"
            data-focus={item.dropId + ':dismiss'}
            aria-label={'Masquer : ' + title}
            onClick={onDismiss}
          >
            Masquer
          </Button>
        </div>
      )}
    </article>
  );
}

function Ledger({ icon, label, items }: { icon: 'give' | 'keep'; label: string; items: string[] }) {
  const Icon = icon === 'give' ? Check : Lock;
  return (
    <div className="flex items-start gap-2">
      <Icon
        aria-hidden="true"
        strokeWidth={icon === 'give' ? 2.2 : 1.8}
        className={cn('mt-0.5 size-3.5 shrink-0', icon === 'give' ? 'text-primary' : 'text-muted-foreground')}
      />
      <div className="min-w-0">
        <div className="text-[12px] font-semibold break-words">{label}</div>
        <ul className="m-0 mt-0.5 list-none p-0 text-[12px] leading-snug break-words text-muted-foreground">
          {items.map((entry, index) => (
            <li key={String(index) + entry}>{entry}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
