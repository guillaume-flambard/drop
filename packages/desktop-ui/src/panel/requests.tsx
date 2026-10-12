/**
 * « Demandes »: what waits for the owner (the shared list of `src/consent/`, T4.35), then the questions this Node
 * sent. Everything a peer wrote (names, titles, questions, reasons, outputs) is rendered as React text, never as HTML.
 */
import { Badge } from '../components/ui/badge.tsx';
import { PendingList } from '../consent/pending-list.tsx';
import { outboundSentence, outboundState, outboundTone } from './logic.ts';
import type { OutboundDrop, PendingItem } from './types.ts';
import { Avatar, List, Loading, Muted, SectionTitle } from './ui.tsx';

export interface RequestsData {
  pending: PendingItem[];
  drops: OutboundDrop[];
}

/** True while a field of the panel has the focus: only then is a live refresh deferred. */
export function editing(): boolean {
  const active = document.activeElement;
  if (!active || !active.closest('#panel-main')) return false;
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT';
}

export function RequestsTab({ data, failed, active }: { data: RequestsData | null; failed: boolean; active: boolean }) {
  if (!data) {
    if (failed) return null;
    return <Loading />;
  }
  const drops = data.drops.slice(0, 10);
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>À décider</SectionTitle>
      <PendingList pending={data.pending} active={active} />
      {drops.length > 0 ? (
        <>
          <SectionTitle className="mt-3">Mes questions</SectionTitle>
          <List>
            {drops.map((drop) => (
              <OutboundRow key={drop.dropId} drop={drop} />
            ))}
          </List>
        </>
      ) : null}
    </div>
  );
}

function OutboundRow({ drop }: { drop: OutboundDrop }) {
  const tone = outboundTone(drop);
  const state = outboundState(drop);
  return (
    <details className="group">
      <summary
        aria-label={'Suivi de ' + drop.title + ' avec ' + drop.ownerName + ' : ' + state}
        className="flex min-h-12 cursor-default list-none items-center gap-2.5 px-3 py-2 outline-none [&::-webkit-details-marker]:hidden"
      >
        <Avatar name={drop.ownerName} accent={2} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{drop.ownerName}</div>
          <Muted className="truncate">{drop.title}</Muted>
        </div>
        <Badge tone={tone} className="px-2 py-0.5 text-[10.5px]">
          {state}
        </Badge>
      </summary>
      <div className="flex flex-col gap-1 px-3 pt-0 pb-3 pl-[54px] text-[12px] leading-snug">
        <div>{outboundSentence(drop)}</div>
        <Muted>État actuel : {state}</Muted>
      </div>
    </details>
  );
}
