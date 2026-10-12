import { useState } from 'react';
import { ArrowRight, Copy, Plus, UsersRound } from 'lucide-react';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { Input } from '../components/ui/input.tsx';
import { PersonLine } from '../components/person.tsx';
import { api } from '../api.ts';
import type { ViewProps } from '../App.tsx';

interface InvitePreview {
  displayName: string;
  team?: string;
  relayHost: string;
}

/**
 * « J'ai reçu une invitation » (T4.23): the code or the link pasted from the join page. The node checks it and shows
 * who invites; nothing is sent before « Rejoindre », as on a drop://join link (T4.14).
 */
function JoinWithCode({ act }: Pick<ViewProps, 'act'>) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  function reset(next: boolean): void {
    setOpen(next);
    setCode('');
    setPreview(null);
    setError('');
  }
  function check(): void {
    setError('');
    api<InvitePreview>('POST', '/ui/pair/preview', { code: code.trim() })
      .then(setPreview)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Invitation illisible.');
      });
  }
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          reset(true);
        }}
      >
        J’ai reçu une invitation
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {preview
                ? preview.team
                  ? preview.displayName + ' t’invite dans l’équipe ' + preview.team
                  : 'Invitation de ' + preview.displayName
                : 'Rejoindre une équipe'}
            </DialogTitle>
            <DialogDescription>
              {preview
                ? 'Nom et équipe annoncés par le lien, via ' +
                  preview.relayHost +
                  ' : si tu ne l’attendais pas, vérifie avec la personne avant de rejoindre. Chaque question reste soumise à ton accord.'
                : 'Colle le code ou le lien reçu. Rien n’est envoyé avant « Rejoindre ».'}
            </DialogDescription>
          </DialogHeader>
          {preview ? null : (
            <div className="space-y-2">
              <label htmlFor="join-code" className="text-xs font-medium">
                Code ou lien d’invitation
              </label>
              <Input
                id="join-code"
                value={code}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
              />
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-2 text-[12px] text-muted-foreground">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                reset(false);
              }}
            >
              {preview ? 'Refuser' : 'Fermer'}
            </Button>
            {preview ? (
              <Button
                onClick={() => {
                  const pasted = code.trim();
                  reset(false);
                  act(
                    () => api('POST', '/ui/pair', { code: pasted }),
                    'Invitation acceptée : tu rejoins l’équipe dans quelques secondes. Ensuite, connecte tes agents.',
                  );
                }}
              >
                Rejoindre
              </Button>
            ) : (
              <Button disabled={!code.trim()} onClick={check}>
                Voir l’invitation
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TeamView({ data, busy, act }: ViewProps) {
  const [name, setName] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const members = data.team?.members ?? [];
  const team = data.team?.team;
  const online = members.filter((member) => member.online).length;

  if (data.team && !team) {
    return (
      <Card className="max-w-[650px]">
        <CardContent className="px-7 py-8">
          <span className="soft-avatar mb-5 grid size-12 place-items-center rounded-2xl">
            <UsersRound size={21} />
          </span>
          <h2 className="text-lg font-semibold tracking-[-.035em]">La collaboration commence ici.</h2>
          <p className="mt-2 mb-6 max-w-[470px] text-[13px] leading-relaxed text-muted-foreground">
            Donne un nom à ton équipe, puis invite les personnes avec lesquelles tu travailles. Chacun gardera le
            contrôle de ses propres informations.
          </p>
          <label htmlFor="team-name" className="mb-2 block text-xs font-medium">
            Nom de l’équipe
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="team-name"
              maxLength={100}
              value={name}
              placeholder="Ex. Atelier"
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            <Button
              disabled={busy || !name.trim()}
              onClick={() => {
                act(
                  () => api('POST', '/ui/admin/team', { name: name.trim() }),
                  'Ton équipe est créée.',
                  () => {
                    setName('');
                  },
                );
              }}
            >
              Créer l’équipe <ArrowRight size={15} />
            </Button>
          </div>
          <p className="mt-6 mb-2 text-[12px] text-muted-foreground">Une personne t’a envoyé un lien ?</p>
          <JoinWithCode act={act} />
        </CardContent>
      </Card>
    );
  }
  function createInvite(): void {
    setInviteError('');
    setInviteBusy(true);
    api<{ code: string; link?: string }>('POST', '/ui/invite')
      .then((result) => {
        // One https link that works without the app (T4.23): the join page installs drop, then opens drop://join.
        setInvite(result.link ?? 'drop://pair?code=' + encodeURIComponent(result.code));
      })
      .catch((e: unknown) => {
        setInviteError(e instanceof Error ? e.message : 'Impossible de créer le lien.');
      })
      .finally(() => {
        setInviteBusy(false);
      });
  }
  function copyInvite(): void {
    if (!('clipboard' in navigator)) {
      setInviteError('Sélectionne le lien puis copie-le.');
      return;
    }
    navigator.clipboard
      .writeText(invite)
      .then(() => {
        setInviteError('Lien copié.');
      })
      .catch(() => {
        setInviteError('Sélectionne le lien puis copie-le.');
      });
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-semibold tracking-[-.04em]">{team?.name || 'Ton équipe'}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {members.length} membres · {online} en ligne
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <JoinWithCode act={act} />
          <Button
            onClick={() => {
              setInviteOpen(true);
              setInvite('');
              setInviteError('');
            }}
          >
            <Plus /> Inviter quelqu’un
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="px-6 py-2 sm:px-7">
          {members.length ? (
            members.map((member, i) => (
              <div
                key={member.nodeId}
                className="flex items-center justify-between gap-4 border-b border-border/90 py-[17px] last:border-0"
              >
                <PersonLine
                  name={member.displayName + (member.self ? ' (toi)' : '')}
                  description={member.agents.length ? member.agents.join(', ') : 'Aucun assistant signalé'}
                  online={member.online}
                  accent={(i % 4) as 0 | 1 | 2 | 3}
                />
                <div className="min-w-0 text-right">
                  <span
                    className={
                      'text-[12px] ' + (member.online ? 'text-[#4e866d] dark:text-[#a1cdb5]' : 'text-muted-foreground')
                    }
                  >
                    {member.online ? 'Disponible' : 'Hors ligne'}
                  </span>
                  {member.capabilities.length ? (
                    <p className="mt-1 max-w-[240px] truncate text-[11px] text-muted-foreground">
                      {member.capabilities.map((x) => x.title.replace('Répondre à partir de ', '')).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="py-9 text-center text-[13px] text-muted-foreground">Ton équipe apparaîtra ici.</div>
          )}
        </CardContent>
      </Card>
      <div className="rounded-2xl border border-border bg-card/70 px-6 py-5">
        <p className="text-[13px] font-semibold">Une invitation ne donne pas d’accès.</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Tes collègues voient les capacités que tu as choisi de partager. Chaque nouvelle question reste soumise à tes
          règles de consentement.
        </p>
      </div>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter une personne</DialogTitle>
            <DialogDescription>
              Un lien personnel à usage unique, valable 24 heures, pour une seule personne. Sa page installe drop puis
              l’ouvre sur ton invitation. Le lien n’autorise aucun partage.
            </DialogDescription>
          </DialogHeader>
          {invite ? (
            <div className="space-y-3">
              <label htmlFor="invite-link" className="text-xs font-medium">
                Ton lien d’invitation
              </label>
              <Input
                id="invite-link"
                value={invite}
                readOnly
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
              />
              <Button variant="secondary" onClick={copyInvite}>
                <Copy /> Copier le lien
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Tu pourras envoyer ce lien directement à ton collègue.</p>
          )}
          {inviteError ? (
            <p role="status" className="mt-2 text-[12px] text-muted-foreground">
              {inviteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setInviteOpen(false);
              }}
            >
              Fermer
            </Button>
            {!invite ? (
              <Button disabled={inviteBusy} onClick={createInvite}>
                {inviteBusy ? 'Création…' : 'Créer le lien'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
