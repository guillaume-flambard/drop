import { useState } from 'react';
import { ChevronRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api } from '../api.ts';
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
import { Switch } from '../components/ui/switch.tsx';
import { PersonLine } from '../components/person.tsx';
import type { ViewProps } from '../App.tsx';

interface ShareDecision {
  name: string;
  agent: string;
  server: string;
  sharedId?: string;
}
export function SharingView({ data, busy, act, toPage }: ViewProps) {
  const [decision, setDecision] = useState<ShareDecision | null>(null);
  const agents = (data.tools?.agents ?? []).filter((a) => a.installed);
  const sources = agents.flatMap((agent) =>
    agent.servers
      .filter((s) => s.shareable)
      .map((server) => ({
        agent: agent.agent,
        label: agent.label,
        server,
        sharedId: data.tools?.shared[agent.agent + '/' + server.name],
      })),
  );
  const shared = sources.filter((s) => Boolean(s.sharedId)).length;
  function confirm() {
    if (!decision) return;
    const target = decision;
    if (target.sharedId) {
      act(
        () => api('POST', '/ui/admin/unshare', { capabilityId: target.sharedId }),
        target.name + ' n’est plus partagé.',
        () => {
          setDecision(null);
        },
      );
    } else {
      act(
        () => api('POST', '/ui/admin/share', { agent: target.agent, server: target.server }),
        'Le partage de ' + target.name + ' est proposé à ton équipe. Chaque demande reste soumise à ton accord.',
        () => {
          setDecision(null);
        },
      );
    }
  }
  return (
    <div className="space-y-6">
      <div className="surface-warm flex flex-col items-start justify-between gap-5 rounded-[22px] p-7 sm:flex-row sm:items-center">
        <div className="max-w-[550px]">
          <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#726894] dark:text-[#c9bbed]">
            <ShieldCheck size={17} /> La réponse, pas l’accès.
          </div>
          <h2 className="text-[19px] font-semibold tracking-[-.04em]">À toi de choisir ce qui peut aider.</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Quand tu partages une capacité, tes collègues peuvent poser une question. Tu gardes le dernier mot et ils
            n’obtiennent jamais les accès à ta source.
          </p>
        </div>
        <span
          aria-hidden="true"
          className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-white/70 text-[#716b9e] sm:grid dark:bg-[#423d4a]"
        >
          <LockKeyhole size={22} />
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">Tes sources</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {sources.length} outils disponibles · {shared} partagé{shared > 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="px-6 py-2 sm:px-7">
          {sources.length ? (
            sources.map((s, i) => {
              const isShared = Boolean(s.sharedId);
              return (
                <div
                  key={s.agent + '/' + s.server.name}
                  className="flex min-w-0 items-center justify-between gap-4 border-b border-border py-[18px] last:border-0"
                >
                  <PersonLine
                    name={s.server.name}
                    description={s.label + (s.server.kind ? ' · ' + s.server.kind : '')}
                    accent={(i % 4) as 0 | 1 | 2 | 3}
                  />
                  <label className="flex cursor-pointer items-center gap-3">
                    <span className="text-[12px] text-muted-foreground">{isShared ? 'Partagé' : 'Privé'}</span>
                    <Switch
                      aria-label={(isShared ? 'Ne plus partager ' : 'Partager ') + s.server.name}
                      checked={isShared}
                      disabled={busy}
                      onCheckedChange={() => {
                        setDecision({
                          name: s.server.name,
                          agent: s.agent,
                          server: s.server.name,
                          ...(s.sharedId ? { sharedId: s.sharedId } : {}),
                        });
                      }}
                    />
                  </label>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <p className="text-[14px] font-semibold">Aucune source disponible</p>
              <p className="mt-1 mb-5 text-[12px] text-muted-foreground">
                Connecte un assistant avec des outils de lecture pour commencer.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  toPage('agents');
                }}
              >
                Connecter un assistant <ChevronRight size={15} />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(decision)}
        onOpenChange={(open) => {
          if (!open) setDecision(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.sharedId ? 'Arrêter le partage' : 'Partager ' + (decision?.name || 'cet outil') + ' ?'}
            </DialogTitle>
            <DialogDescription>
              {decision?.sharedId
                ? 'Cette source ne pourra plus répondre aux nouvelles questions de tes collègues.'
                : 'Drop proposera des réponses à partir de cette source, mais uniquement dans les limites fixées par sa capacité et après ton accord.'}
            </DialogDescription>
          </DialogHeader>
          {!decision?.sharedId ? (
            <div className="rounded-xl border border-border bg-muted p-4 text-[12px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Ce qui ne change pas :</span> tes collègues ne reçoivent
              ni tes identifiants ni l’accès direct à cette source.
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDecision(null);
              }}
            >
              Annuler
            </Button>
            <Button variant={decision?.sharedId ? 'destructive' : 'default'} disabled={busy} onClick={confirm}>
              {decision?.sharedId ? 'Ne plus partager' : 'Confirmer le partage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
