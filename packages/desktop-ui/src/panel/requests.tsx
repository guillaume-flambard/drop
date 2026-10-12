/**
 * « Demandes »: decisions and reviews waiting for the owner, then the questions this Node sent. Everything a peer wrote
 * (names, titles, questions, reasons, outputs) is rendered as React text, never as HTML.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, CircleCheck, Clock3, Lock, PenLine, ShieldAlert } from 'lucide-react';
import { api } from '../api.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Textarea } from '../components/ui/textarea.tsx';
import { cn } from '../lib/utils.ts';
import {
  ANSWER_ACCEPT,
  ANSWER_MAX_CHARS,
  HIGH_SENSITIVITY,
  agentName,
  answerFile,
  answerPayload,
  answerTooLarge,
  costLine,
  countdown,
  decisionMessage,
  explain,
  failureText,
  fileSummary,
  keepDrafts,
  outboundSentence,
  outboundState,
  outboundTone,
  reviewFields,
  reviewForm,
  type AnswerDraft,
  type Decision,
} from './logic.ts';
import type { ApprovalItem, OutboundDrop, PendingItem, ReviewItem } from './types.ts';
import { Avatar, Empty, List, Loading, Meta, Muted, SectionTitle, compactTextarea, usePanel } from './ui.tsx';

export interface RequestsData {
  pending: PendingItem[];
  drops: OutboundDrop[];
}

const LEAVE_MS = 160;

/** True while a field of the panel has the focus: only then is a live refresh deferred. */
export function editing(): boolean {
  const active = document.activeElement;
  if (!active || !active.closest('#panel-main')) return false;
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT';
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

export function RequestsTab({ data, failed, active }: { data: RequestsData | null; failed: boolean; active: boolean }) {
  const panel = usePanel();
  const now = useNow();
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const pending = data?.pending ?? [];
  const expiredSeen = useRef(false);

  // A draft whose card was decided, answered elsewhere or expired leaves the page memory with it.
  useEffect(() => {
    if (data) setDrafts((current) => keepDrafts(current, data.pending));
  }, [data]);

  // An expired card leaves at the next refresh, unless the owner is typing.
  useEffect(() => {
    const expired = pending.some((item) => item.expiresAt <= now);
    if (expired && !expiredSeen.current && !editing()) {
      expiredSeen.current = true;
      panel.refreshRequests();
    }
    if (!expired) expiredSeen.current = false;
  }, [now, pending, panel]);

  // Keyboard default: with nothing focused, « Pas maintenant » of the first card takes the focus, never « Autoriser ».
  const firstApproval = pending.find((item) => item.kind === 'approval')?.dropId;
  useEffect(() => {
    if (!active || !firstApproval) return;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    document.querySelector<HTMLElement>('[data-default-action="' + firstApproval + '"]')?.focus();
  }, [active, firstApproval]);

  const leave = (dropId: string, message: string) => {
    setLeaving((current) => ({ ...current, [dropId]: true }));
    panel.info(message);
    setTimeout(() => {
      panel.refreshRequests();
    }, LEAVE_MS);
  };

  const decide = (path: '/ui/decide' | '/ui/review', dropId: string, form: URLSearchParams, message: string) =>
    api('POST', path, form).then(
      () => {
        leave(dropId, message);
      },
      (error: unknown) => {
        panel.fail(failureText(error));
        panel.refreshRequests();
      },
    );

  if (!data) {
    if (failed) return null;
    return <Loading />;
  }
  const drops = data.drops.slice(0, 10);
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>À décider</SectionTitle>
      {pending.length === 0 ? (
        <Empty
          icon={
            <CircleCheck aria-hidden="true" className="size-6 text-[#4a9b79] dark:text-[#7fcaa5]" strokeWidth={1.6} />
          }
          title="Tout est à jour"
        >
          Lorsqu’un collègue aura une question, tu pourras choisir ce qui lui sera transmis.
        </Empty>
      ) : null}
      {pending.map((item) =>
        item.kind === 'approval' ? (
          <ApprovalCard
            key={item.dropId}
            item={item}
            now={now}
            leaving={Boolean(leaving[item.dropId])}
            draft={drafts[item.dropId]}
            setDraft={(draft) => {
              setDrafts((current) => {
                const others = Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.dropId));
                return draft ? { ...others, [item.dropId]: draft } : others;
              });
            }}
            onDecide={(decision) =>
              decide('/ui/decide', item.dropId, decisionForm(item.dropId, decision), decisionMessage(decision))
            }
            onAnswered={() => {
              leave(item.dropId, decisionMessage('send'));
            }}
          />
        ) : (
          <ReviewCard
            key={item.dropId}
            item={item}
            leaving={Boolean(leaving[item.dropId])}
            onReview={(decision, removed) =>
              decide('/ui/review', item.dropId, reviewForm(item.dropId, decision, removed), decisionMessage(decision))
            }
          />
        ),
      )}
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

function decisionForm(dropId: string, decision: Decision): URLSearchParams {
  return new URLSearchParams({ dropId, decision });
}

/** Runs one async action at a time from a button: disabled while it runs, re-enabled when it fails. */
function useBusy(): [boolean, (task: () => Promise<unknown>) => void] {
  const [busy, setBusy] = useState(false);
  return [
    busy,
    (task) => {
      setBusy(true);
      task()
        .catch(() => undefined)
        .finally(() => {
          setBusy(false);
        });
    },
  ];
}

export function ApprovalCard({
  item,
  now,
  leaving,
  draft,
  setDraft,
  onDecide,
  onAnswered,
}: {
  item: ApprovalItem;
  now: number;
  leaving: boolean;
  draft: AnswerDraft | undefined;
  setDraft: (draft: AnswerDraft | null) => void;
  onDecide: (decision: Decision) => Promise<unknown>;
  onAnswered: () => void;
}) {
  const panel = usePanel();
  const [busy, run] = useBusy();
  const who = item.requestedBy.displayName;
  const title = item.card.title;
  const cost = costLine(item.card, who);
  const headingId = 'card-' + item.dropId;
  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'panel-surface motion-arrive flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 transition-[opacity,transform] duration-150 ease-out',
        leaving && 'pointer-events-none scale-[.98] opacity-0',
      )}
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
        <Meta className="flex items-center gap-1.5">
          <Clock3 aria-hidden="true" className="size-3.5" />
          <span>Expire dans {countdown(item.expiresAt, now)}</span>
        </Meta>
      </div>
      <div className="flex items-center gap-1.5 pt-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="mr-auto px-2"
          data-default-action={item.dropId}
          data-focus={item.dropId + ':not_now'}
          aria-label={'Reporter : ' + title}
          disabled={busy}
          onClick={() => {
            run(() => onDecide('not_now'));
          }}
        >
          Pas maintenant
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-focus={item.dropId + ':deny'}
          aria-label={'Refuser : ' + title}
          disabled={busy}
          onClick={() => {
            run(() => onDecide('deny'));
          }}
        >
          Refuser
        </Button>
        <Button
          size="sm"
          data-focus={item.dropId + ':allow'}
          aria-label={'Autoriser une fois : ' + title}
          disabled={busy}
          onClick={() => {
            run(() => onDecide('allow_once'));
          }}
        >
          Autoriser une fois
        </Button>
      </div>
      {draft ? (
        <Composer item={item} who={who} draft={draft} setDraft={setDraft} onAnswered={onAnswered} />
      ) : (
        <div className="border-t border-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-1 px-2"
            data-focus={item.dropId + ':compose'}
            aria-label={'Répondre moi-même : ' + title}
            onClick={() => {
              setDraft({ stage: 'write', text: '', file: null });
              panel.focusTo(item.dropId + ':answer');
            }}
          >
            <PenLine aria-hidden="true" />
            Répondre moi-même
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

/**
 * « Répondre moi-même » (T4.3): write, then review exactly what will leave, then send. Nothing leaves before
 * « Envoyer ». When the capability lives on another Node, that Node receives the answer first: it is named from the
 * local peer store (executorName), never from the card a peer sent.
 */
export function Composer({
  item,
  who,
  draft,
  setDraft,
  onAnswered,
}: {
  item: ApprovalItem;
  who: string;
  draft: AnswerDraft;
  setDraft: (draft: AnswerDraft | null) => void;
  onAnswered: () => void;
}) {
  const panel = usePanel();
  const [busy, run] = useBusy();
  const [invalid, setInvalid] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = (name: string) => item.dropId + ':' + name;

  if (draft.stage === 'review') {
    const send = () => {
      run(async () => {
        const payload = answerPayload(item.dropId, draft);
        if (answerTooLarge(payload)) {
          setDraft({ ...draft, stage: 'write' });
          panel.fail(explain('E_TOO_LARGE'));
          panel.focusTo(key('answer'));
          return;
        }
        try {
          await api('POST', '/ui/answer', payload);
          onAnswered();
        } catch (error) {
          setDraft({ ...draft, stage: 'write' });
          panel.fail(failureText(error, true));
          panel.focusTo(key('answer'));
        }
      });
    };
    return (
      <div role="group" aria-label="Ta réponse, à relire" className="flex flex-col gap-2 border-t border-border pt-2.5">
        <div className="text-[12px] font-semibold">
          {item.executorName
            ? item.executorName + ' recevra exactement, pour ' + who + ' :'
            : who + ' recevra exactement :'}
        </div>
        {draft.text.trim() ? (
          <p className="selectable m-0 rounded-xl bg-muted px-3 py-2.5 text-[13px] leading-[1.45] break-words whitespace-pre-wrap">
            {draft.text}
          </p>
        ) : null}
        {draft.file ? (
          <>
            <Muted>{fileSummary(draft.file)}</Muted>
            <pre
              tabIndex={0}
              aria-label={'Contenu de ' + draft.file.name}
              className="selectable m-0 max-h-40 overflow-auto rounded-xl bg-muted px-3 py-2 font-mono text-[11px] leading-[1.45] break-words whitespace-pre-wrap"
            >
              {draft.file.content}
            </pre>
          </>
        ) : null}
        <Meta>Les secrets reconnus bloquent l’envoi. Rien n’est parti.</Meta>
        <div className="flex justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            data-focus={key('edit')}
            onClick={() => {
              setDraft({ ...draft, stage: 'write' });
              panel.focusTo(key('answer'));
            }}
          >
            Modifier
          </Button>
          <Button
            size="sm"
            data-focus={key('send')}
            aria-label={'Envoyer ta réponse : ' + item.card.title}
            disabled={busy}
            onClick={send}
          >
            Envoyer
          </Button>
        </div>
      </div>
    );
  }

  const attach = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    const refuse = (message: string) => {
      if (fileInput.current) fileInput.current.value = '';
      panel.fail(message);
      panel.focusTo(key('file'));
    };
    if (file.size > 128 * 1024) {
      refuse(explain('E_TOO_LARGE'));
      return;
    }
    reader.onload = () => {
      const read = answerFile(file.name, file.size, typeof reader.result === 'string' ? reader.result : '');
      if ('error' in read) {
        refuse(read.error);
        return;
      }
      setDraft({ ...draft, file: read });
      panel.focusTo(key('unattach'));
    };
    reader.onerror = () => {
      refuse(explain('E_SCHEMA'));
    };
    reader.readAsText(file);
  };

  return (
    <div role="group" aria-label="Répondre moi-même" className="flex flex-col gap-2 border-t border-border pt-2.5">
      <label className="flex flex-col gap-1.5 text-[12px] font-medium">
        Ta réponse
        <Textarea
          rows={5}
          maxLength={ANSWER_MAX_CHARS}
          data-focus={key('answer')}
          aria-label={'Ta réponse à ' + who}
          aria-invalid={invalid || undefined}
          className={cn('selectable', compactTextarea)}
          value={draft.text}
          onChange={(event) => {
            setInvalid(false);
            setDraft({ ...draft, text: event.target.value });
          }}
        />
      </label>
      <span aria-live="off" className="self-end text-[11px] text-muted-foreground tabular-nums">
        {draft.text.length.toLocaleString('fr-FR')} / 8 000
      </span>
      {item.executorName ? (
        <Meta>
          Ta réponse part chez {item.executorName}, qui gère cet outil, puis vers {who}.
        </Meta>
      ) : null}
      {draft.file ? (
        <div className="flex items-center gap-2 text-[12px] break-all text-muted-foreground">
          <span className="min-w-0 flex-1">Fichier : {draft.file.name}</span>
          <Button
            variant="secondary"
            size="sm"
            data-focus={key('unattach')}
            onClick={() => {
              setDraft({ ...draft, file: null });
              panel.focusTo(key('file'));
            }}
          >
            Retirer
          </Button>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 text-[12px] font-medium">
          Fichier texte (facultatif, 128 Kio au plus)
          <input
            ref={fileInput}
            type="file"
            data-focus={key('file')}
            accept={ANSWER_ACCEPT}
            aria-label="Joindre un fichier texte"
            className="max-w-full text-[12px] font-normal text-muted-foreground file:mr-2 file:rounded-lg file:border file:border-border file:bg-card file:px-2.5 file:py-1 file:text-[12px] file:text-foreground"
            onChange={(event) => {
              attach(event.target.files?.[0]);
            }}
          />
        </label>
      )}
      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          data-focus={key('cancel')}
          onClick={() => {
            setDraft(null);
            panel.focusTo(key('compose'));
          }}
        >
          Annuler
        </Button>
        <Button
          size="sm"
          data-focus={key('review')}
          onClick={() => {
            if (!draft.text.trim() && !draft.file) {
              setInvalid(true);
              panel.announce('Écris une réponse ou joins un fichier.');
              panel.focusTo(key('answer'));
              return;
            }
            setDraft({ ...draft, stage: 'review' });
            panel.focusTo(key('send'));
          }}
        >
          Relire la réponse
        </Button>
      </div>
    </div>
  );
}

export function ReviewCard({
  item,
  leaving,
  onReview,
}: {
  item: ReviewItem;
  leaving: boolean;
  onReview: (decision: 'send' | 'discard', removed: string[]) => Promise<unknown>;
}) {
  const [busy, run] = useBusy();
  const [removed, setRemoved] = useState<string[]>([]);
  const fields = reviewFields(item.output);
  const headingId = 'review-' + item.dropId;
  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'panel-surface motion-arrive flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 transition-[opacity,transform] duration-150 ease-out',
        leaving && 'pointer-events-none scale-[.98] opacity-0',
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <Badge tone="warning">À relire</Badge>
        </div>
        <div id={headingId} className="mt-2 text-[14px] leading-snug font-semibold break-words">
          <span className="sr-only">À relire : </span>
          {item.title}
        </div>
        <Muted className="mt-1">Ta réponse est prête. Rien n’est parti. Relis les informations avant de choisir.</Muted>
      </div>
      <dl className="selectable m-0 flex flex-col gap-0 overflow-hidden rounded-xl bg-muted">
        {fields.map((field) => {
          const off = removed.includes(field.key);
          return (
            <div key={field.key} className="flex flex-col gap-0.5 border-b border-border/70 px-3 py-2 last:border-0">
              <div className="flex items-center gap-2">
                <dt className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{field.key}</dt>
                <label className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Checkbox
                    aria-label={'Retirer ' + field.key + ' avant l’envoi'}
                    checked={off}
                    onCheckedChange={(value) => {
                      setRemoved((current) =>
                        value === true ? [...current, field.key] : current.filter((key) => key !== field.key),
                      );
                    }}
                  />
                  Retirer
                </label>
              </div>
              <dd className={cn('m-0 text-[12.5px] break-words', off && 'text-muted-foreground line-through')}>
                {field.value}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          aria-label={'Ne pas envoyer : ' + item.title}
          disabled={busy}
          onClick={() => {
            run(() => onReview('discard', []));
          }}
        >
          Ne pas envoyer
        </Button>
        <Button
          size="sm"
          aria-label={'Envoyer : ' + item.title}
          disabled={busy}
          onClick={() => {
            run(() => onReview('send', removed));
          }}
        >
          Envoyer
        </Button>
      </div>
    </article>
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
