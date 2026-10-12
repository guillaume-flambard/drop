/**
 * What waits for the owner (T4.35): consent cards, « Répondre moi-même » and review cards, shared by the panel's
 * « Demandes » tab and the workspace's « Demandes » page. The surface's actions (single live region, banners, focus,
 * refresh) come from `PanelContext`. Everything a peer wrote is rendered as React text, never as HTML.
 */
import { useEffect, useRef, useState } from 'react';
import { CircleCheck, PenLine } from 'lucide-react';
import { api } from '../api.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Textarea } from '../components/ui/textarea.tsx';
import { cn } from '../lib/utils.ts';
import {
  ANSWER_ACCEPT,
  ANSWER_MAX_CHARS,
  answerFile,
  answerPayload,
  answerTooLarge,
  decisionMessage,
  explain,
  failureText,
  fileSummary,
  keepDrafts,
  reviewFields,
  reviewForm,
  type AnswerDraft,
} from '../panel/logic.ts';
import type { ApprovalItem, PendingItem, ReviewItem } from '../panel/types.ts';
import { Empty, Meta, Muted, compactTextarea, usePanel } from '../panel/ui.tsx';
import { ConsentCard } from './card.tsx';
import { replyFromError, type ConsentState, type NodeReply } from './model.ts';
import { useConsentCards } from './use-consent-cards.ts';

const LEAVE_MS = 160;

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

export function PendingList({ pending, active }: { pending: PendingItem[]; active: boolean }) {
  const panel = usePanel();
  const now = useNow();
  const cards = useConsentCards(pending, now);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});

  // A draft whose card was decided, answered elsewhere or expired leaves the page memory with it; one whose answer is
  // being sent stays until the Node replies, even if the card already left the Node's list.
  const entries = cards.entries;
  useEffect(() => {
    const sending = entries.filter((entry) => entry.state.kind === 'deciding').map((entry) => entry.item);
    setDrafts((current) => keepDrafts(current, [...pending, ...sending]));
  }, [pending, entries]);

  // Keyboard default: with nothing focused, « Pas maintenant » of the first waiting card takes the focus, never
  // « Autoriser ».
  const firstApproval = cards.entries.find((entry) => entry.state.kind === 'pending')?.item.dropId;
  useEffect(() => {
    if (!active || !firstApproval) return;
    const focused = document.activeElement;
    if (focused && focused !== document.body) return;
    document.querySelector<HTMLElement>('[data-default-action="' + firstApproval + '"]')?.focus();
  }, [active, firstApproval]);

  const reviews = pending.filter((item): item is ReviewItem => item.kind === 'review');
  const rows = [
    ...cards.entries.map((entry) => ({ at: entry.item.expiresAt, entry, review: null })),
    ...reviews.map((review) => ({ at: review.expiresAt, entry: null, review })),
  ].sort((a, b) => a.at - b.at);
  const nothingWaits =
    reviews.length === 0 &&
    cards.entries.every((entry) => entry.state.kind !== 'pending' && entry.state.kind !== 'deciding');

  const review = (item: ReviewItem, decision: 'send' | 'discard', removed: string[]) =>
    api('POST', '/ui/review', reviewForm(item.dropId, decision, removed)).then(
      () => {
        setLeaving((current) => ({ ...current, [item.dropId]: true }));
        panel.info(decisionMessage(decision));
        setTimeout(() => {
          panel.refreshRequests();
        }, LEAVE_MS);
      },
      (error: unknown) => {
        panel.fail(failureText(error));
        panel.refreshRequests();
      },
    );

  return (
    <div data-focus="consent-list" tabIndex={-1} className="flex flex-col gap-3 outline-none">
      {nothingWaits ? (
        <Empty
          icon={
            <CircleCheck aria-hidden="true" className="size-6 text-[#4a9b79] dark:text-[#7fcaa5]" strokeWidth={1.6} />
          }
          title="Tout est à jour"
        >
          Lorsqu’un collègue aura une question, tu pourras choisir ce qui lui sera transmis.
        </Empty>
      ) : null}
      {rows.map(({ entry, review: item }) => {
        if (item)
          return (
            <ReviewCard
              key={item.dropId}
              item={item}
              leaving={Boolean(leaving[item.dropId])}
              onReview={(decision, removed) => review(item, decision, removed)}
            />
          );
        const id = entry.item.dropId;
        const draft = drafts[id];
        const waits = entry.state.kind === 'pending';
        const answering = entry.state.kind === 'deciding' && entry.state.action === 'answer';
        return (
          <ConsentCard
            key={id}
            item={entry.item}
            state={entry.state}
            now={now}
            onDecide={(decision) => {
              cards.decide(id, decision).catch(() => undefined);
            }}
            onDismiss={() => {
              cards.dismiss(id);
            }}
          >
            {draft && (waits || answering) ? (
              <Composer
                item={entry.item}
                draft={draft}
                setDraft={(next) => {
                  setDrafts((current) => {
                    const others = Object.fromEntries(Object.entries(current).filter(([key]) => key !== id));
                    return next ? { ...others, [id]: next } : others;
                  });
                }}
                onSending={() => cards.startAnswer(id)}
                onSettled={(reply) => cards.finishAnswer(id, reply)}
              />
            ) : waits ? (
              <div className="border-t border-border pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-1 px-2"
                  data-focus={id + ':compose'}
                  aria-label={'Répondre moi-même : ' + entry.item.card.title}
                  onClick={() => {
                    setDrafts((current) => ({ ...current, [id]: { stage: 'write', text: '', file: null } }));
                    panel.focusTo(id + ':answer');
                  }}
                >
                  <PenLine aria-hidden="true" />
                  Répondre moi-même
                </Button>
              </div>
            ) : null}
          </ConsentCard>
        );
      })}
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
  draft,
  setDraft,
  onSending,
  onSettled,
}: {
  item: ApprovalItem;
  draft: AnswerDraft;
  setDraft: (draft: AnswerDraft | null) => void;
  onSending: () => boolean;
  onSettled: (reply: NodeReply) => ConsentState;
}) {
  const panel = usePanel();
  const [busy, run] = useBusy();
  const [invalid, setInvalid] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = (name: string) => item.dropId + ':' + name;
  const who = item.requestedBy.displayName;

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
        if (!onSending()) return;
        let reply: NodeReply;
        let refusal = '';
        try {
          reply = { kind: 'ok', body: await api('POST', '/ui/answer', payload) };
        } catch (error) {
          reply = replyFromError(error);
          refusal = failureText(error, true);
        }
        // Refused before anything left (a secret, a size, a session): the draft comes back with the reason.
        if (onSettled(reply).kind === 'pending') {
          setDraft({ ...draft, stage: 'write' });
          panel.fail(refusal || explain('E_SCHEMA'));
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
            disabled={busy}
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
