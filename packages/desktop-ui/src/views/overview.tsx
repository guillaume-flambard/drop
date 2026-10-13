import { ArrowUpRight, ChevronRight, MessageCircle, ShieldCheck, UsersRound } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { PersonLine } from '../components/person.tsx';
import { stateSentence, stateLabel } from '../lib/format.ts';
import type { ViewProps } from '../App.tsx';
import type { DropStatus } from '../types.ts';

function ActivityList({ items }: { items: DropStatus[] }) {
  if (!items.length) {
    return (
      <div className="py-12 text-center">
        <p className="text-[13px] font-semibold">Rien à suivre pour le moment.</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Tes prochaines questions apparaîtront ici.</p>
      </div>
    );
  }
  return (
    <div>
      {items.slice(0, 6).map((drop, i) => {
        const tone =
          drop.state === 'delivered' || drop.state === 'receipted'
            ? 'success'
            : drop.state === 'denied' || drop.state === 'failed'
              ? 'danger'
              : drop.state === 'awaiting_approval'
                ? 'warning'
                : 'neutral';
        return (
          <div
            key={drop.dropId}
            className="flex min-w-0 items-start justify-between gap-3 border-b border-border/90 py-[17px] last:border-b-0"
          >
            <div className="min-w-0">
              <PersonLine
                name={drop.ownerName || 'Collègue'}
                description={drop.title}
                accent={(i % 4) as 0 | 1 | 2 | 3}
                size="sm"
              />
              <p className="mt-2.5 ml-12 max-w-[540px] text-[12px] leading-relaxed text-muted-foreground">
                {stateSentence(drop)}
              </p>
            </div>
            <Badge tone={tone} className="shrink-0">
              {stateLabel(drop.state)}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
export function OverviewView({ data, loading, toPage }: ViewProps) {
  const members = data.team?.members ?? [];
  const shared = Object.keys(data.tools?.shared ?? {}).length;
  const agents = (data.tools?.agents ?? []).filter((a) => a.dropInstalled).length;
  const drops = data.outbound?.drops ?? [];
  const completed = drops.filter((d) => ['delivered', 'receipted', 'denied', 'expired', 'failed'].includes(d.state));
  const ongoing = drops.filter((d) => !['delivered', 'receipted', 'denied', 'expired', 'failed'].includes(d.state));
  return (
    <div className="space-y-6">
      {data.status?.security?.replayStorageBlocked ? (
        <section className="rounded-2xl border border-destructive/40 p-5" role="alert">
          <h2 className="text-[14px] font-semibold">Vérification de sécurité indisponible</h2>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            Drop refuse les nouvelles demandes pour protéger cet appareil. Le stockage anti-rejeu doit être vérifié par
            son propriétaire. Ne supprime pas les données de Drop pour résoudre ce problème.
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              toPage('diagnostic');
            }}
          >
            Voir le diagnostic
          </Button>
        </section>
      ) : null}
      <section className="surface-warm relative overflow-hidden rounded-[23px] p-7 sm:p-9">
        <div className="relative z-10 max-w-[530px]">
          <p className="mb-3 text-[11px] font-medium tracking-wide text-[#777078] dark:text-muted-foreground">
            La réponse, pas l’accès.
          </p>
          <h2 className="pretty-balance text-[24px] leading-[1.22] font-semibold tracking-[-.048em] text-foreground sm:text-[29px]">
            Les bonnes informations. <span className="text-[#8b80a6] dark:text-[#aaa0ca]">Aux bonnes personnes.</span>
          </h2>
          <p className="mt-3 max-w-[430px] text-[13px] leading-[1.7] text-muted-foreground">
            Tes collègues posent une question, tu choisis ce que tu souhaites transmettre. Et le travail avance.
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => {
              toPage('team');
            }}
          >
            Voir mon équipe <ArrowUpRight size={15} />
          </Button>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-[88px] -bottom-[138px] size-[340px] rounded-full border-[48px] border-[#e8e3f2]/35 dark:border-[#514a61]/40"
        />
      </section>
      <section className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(260px,.8fr)]">
        <Card className="min-w-0">
          <CardContent className="px-6 pt-6 pb-3 sm:px-7">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-.025em]">Tes échanges</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Ce qui attend une réponse, et ce qui est arrivé.
                </p>
              </div>
              <MessageCircle size={18} strokeWidth={1.6} className="text-muted-foreground/65" />
            </div>
            <Tabs defaultValue="ongoing">
              <TabsList>
                <TabsTrigger value="ongoing">
                  En cours {ongoing.length ? '(' + String(ongoing.length) + ')' : ''}
                </TabsTrigger>
                <TabsTrigger value="completed">Terminés</TabsTrigger>
              </TabsList>
              <TabsContent value="ongoing">
                <ActivityList items={ongoing} />
              </TabsContent>
              <TabsContent value="completed">
                <ActivityList items={completed} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardContent className="px-6 py-6">
              <div className="mb-5 flex items-center gap-2">
                <UsersRound size={18} className="text-primary" strokeWidth={1.7} />
                <h2 className="text-[15px] font-semibold tracking-[-.025em]">Autour de toi</h2>
              </div>
              <div className="space-y-4 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Dans ton équipe</span>
                  <span className="font-semibold">{loading ? '—' : members.length} personnes</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Assistants raccordés</span>
                  <span className="font-semibold">{loading ? '—' : agents}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Outils partagés</span>
                  <span className="font-semibold">{loading ? '—' : shared}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  toPage('sharing');
                }}
                className="mt-6 flex w-full items-center justify-between border-t border-border pt-4 text-[12px] font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                Gérer mes partages <ChevronRight size={15} />
              </button>
            </CardContent>
          </Card>
          <div className="flex items-start gap-3 rounded-[17px] border border-border bg-card/60 p-5">
            <ShieldCheck size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-[#5d9378] dark:text-[#a9d3bc]" />
            <p className="text-[12px] leading-[1.6] text-muted-foreground">
              Une autorisation est valable pour{' '}
              <strong className="font-semibold text-foreground">une seule demande</strong>. Tes outils et tes
              identifiants restent chez toi.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
