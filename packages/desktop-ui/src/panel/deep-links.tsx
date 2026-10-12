/**
 * Cards opened by a deep link. Nothing happens until the owner clicks: `drop://pair` (T4.14) pairs only after
 * « Rejoindre », `drop://link` (T2.13) links an assistant only after « Autoriser ».
 */
import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { api } from '../api.ts';
import { Button } from '../components/ui/button.tsx';
import { failureText, linkWarnings } from './logic.ts';
import type { LinkRequest, PendingInvite } from './types.ts';
import { Muted, usePanel } from './ui.tsx';

export const EXPIRED_INVITE = 'Ce lien d’invitation n’est plus valable. Demande-en un nouveau.';

export function InviteCard({ invite, onDone }: { invite: PendingInvite; onDone: (joined: boolean) => void }) {
  const panel = usePanel();
  const [busy, setBusy] = useState(false);
  return (
    <article
      aria-labelledby="invite-title"
      className="panel-surface motion-arrive flex flex-col gap-3 rounded-2xl border border-primary/30 bg-card p-3.5"
    >
      <h2 id="invite-title" className="m-0 text-[14px] leading-snug font-semibold break-words">
        {invite.team
          ? invite.displayName + ' t’invite dans l’équipe ' + invite.team
          : 'Invitation de ' + invite.displayName}
      </h2>
      <Muted>
        Nom et équipe annoncés par le lien : si tu ne l’attendais pas, vérifie avec la personne avant de rejoindre.
      </Muted>
      <Muted>
        En rejoignant, vous verrez les outils partagés l’un de l’autre. Chaque question reste soumise à ton accord ;
        personne ne reçoit d’accès.
      </Muted>
      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          autoFocus
          onClick={() => {
            panel.info('Invitation refusée.');
            onDone(false);
          }}
        >
          Refuser
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            api('POST', '/ui/pair', new URLSearchParams({ code: invite.code })).then(
              () => {
                panel.info('Invitation acceptée : tu rejoins l’équipe dans quelques secondes.');
                onDone(true);
              },
              () => {
                panel.fail(EXPIRED_INVITE);
                onDone(false);
              },
            );
          }}
        >
          Rejoindre
        </Button>
      </div>
    </article>
  );
}

export function LinkCard({
  request,
  gateways,
  onDone,
}: {
  request: LinkRequest;
  gateways: readonly string[];
  onDone: () => void;
}) {
  const panel = usePanel();
  const [busy, setBusy] = useState(false);
  const { complete, warnings } = linkWarnings(request, gateways);
  const who = request.client + (request.redirect ? ' (' + request.redirect + ')' : '');
  return (
    <article
      aria-labelledby="link-title"
      className="panel-surface motion-arrive flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5"
    >
      <h2 id="link-title" className="m-0 text-[14px] leading-snug font-semibold break-words">
        Autoriser {who} à demander à ton équipe ?
      </h2>
      <p className="m-0 text-[12.5px] leading-relaxed break-words">
        {request.client} pourra poser des questions à tes collègues en ton nom. Chacun continue d’accepter ou de refuser
        chaque question ; personne ne reçoit d’accès.
      </p>
      {warnings.map((warning) => (
        <div
          key={warning}
          className="flex items-start gap-2 rounded-xl border border-destructive/35 px-3 py-2 text-[12px] leading-snug break-words text-destructive"
        >
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {warning}
        </div>
      ))}
      <div className="flex justify-end gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          autoFocus
          onClick={() => {
            panel.info('Raccordement refusé.');
            onDone();
          }}
        >
          Refuser
        </Button>
        {complete ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              api('POST', '/ui/admin/link', {
                gateway: request.gateway,
                session: request.session,
                client: request.client,
                clientId: request.clientId,
                redirect: request.redirect,
              }).then(
                () => {
                  panel.info(request.client + ' est relié. Tu peux revenir dans ta conversation.');
                  onDone();
                },
                (error: unknown) => {
                  setBusy(false);
                  panel.fail(failureText(error));
                },
              );
            }}
          >
            Autoriser
          </Button>
        ) : null}
      </div>
    </article>
  );
}
