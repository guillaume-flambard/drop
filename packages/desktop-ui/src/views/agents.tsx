import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, ChevronDown, ScanSearch, ShieldCheck } from 'lucide-react';
import { api } from '../api.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { PersonLine } from '../components/person.tsx';
import type { OnboardingData, OnboardingPlan } from '../types.ts';
import type { ViewProps } from '../App.tsx';

function detail(state: string): string {
  if (state === 'ready') return 'Prêt à être connecté';
  if (state === 'already_connected') return 'Connecteur Drop présent';
  if (state === 'manual') return 'Configuration à faire soi-même';
  if (state === 'conflict') return 'Configuration existante différente';
  if (state === 'error') return 'Une correction est nécessaire';
  return 'Analyse terminée';
}

export function AgentsView({ data, busy, act }: ViewProps) {
  const [preview, setPreview] = useState<OnboardingData | null>(null);
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [disconnect, setDisconnect] = useState<OnboardingPlan | null>(null);

  function analyze(): void {
    setScanError('');
    setScanning(true);
    api<OnboardingData>('GET', '/ui/admin/onboarding')
      .then((result) => {
        setPreview(result);
        setSelected([]);
      })
      .catch((e: unknown) => {
        setScanError(e instanceof Error ? e.message : 'Analyse impossible.');
      })
      .finally(() => {
        setScanning(false);
      });
  }
  const plans = preview?.agents.filter((p) => p.state !== 'absent') ?? [];
  const ready = plans.filter((p) => p.state === 'ready');
  const existing = (data.tools?.agents ?? []).filter((agent) => agent.installed);
  const installed = existing.filter((agent) => agent.dropInstalled).length;

  // Keep the scan itself a read-only action: selecting checkboxes never updates a local agent.
  useEffect(() => {
    if (!preview) setSelected([]);
  }, [preview]);

  return (
    <div className="space-y-6">
      <Card className="surface-warm">
        <CardContent className="flex flex-col items-start justify-between gap-5 px-7 py-7 md:flex-row md:items-center md:px-8">
          <div className="max-w-[470px]">
            <h2 className="text-[19px] font-semibold tracking-[-.045em]">Les assistants que tu connais déjà.</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Retrouve Claude, Codex, Cursor, OpenCode et les autres en quelques clics. L’analyse lit leurs
              configurations connues, pas tes conversations.
            </p>
          </div>
          <Button disabled={busy || scanning} onClick={analyze}>
            <ScanSearch size={17} /> {scanning ? 'Analyse en cours…' : 'Analyser cet ordinateur'}
          </Button>
        </CardContent>
      </Card>
      {scanError ? (
        <div className="rounded-xl border border-destructive/30 px-4 py-3 text-[12px] text-destructive" role="alert">
          {scanError}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-.025em]">
            {preview ? 'Résultat de l’analyse' : 'Assistants présents'}
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {preview ? String(plans.length) + ' assistants trouvés' : String(installed) + ' connecteurs déjà raccordés'}
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="px-6 py-2 sm:px-7">
          {preview ? (
            plans.length ? (
              plans.map((plan, index) => (
                <div key={plan.agent} className="border-b border-border py-4 last:border-0">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <PersonLine
                      name={plan.label}
                      description={detail(plan.state)}
                      accent={(index % 4) as 0 | 1 | 2 | 3}
                    />
                    {plan.state === 'ready' ? (
                      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                        <Checkbox
                          checked={selected.includes(plan.agent)}
                          aria-label={'Connecter ' + plan.label}
                          onCheckedChange={(value) => {
                            setSelected((current) =>
                              value === true
                                ? [...new Set([...current, plan.agent])]
                                : current.filter((item) => item !== plan.agent),
                            );
                          }}
                        />
                        <span className="hidden sm:inline">Sélectionner</span>
                      </label>
                    ) : plan.state === 'already_connected' ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-[12px] text-muted-foreground underline-offset-4 hover:underline"
                        onClick={() => {
                          setDisconnect(plan);
                        }}
                      >
                        Retirer
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {plan.state === 'manual' ? 'À configurer' : 'À vérifier'}
                      </span>
                    )}
                  </div>
                  {plan.manual ? (
                    <details className="mt-3 ml-[50px] text-[12px] text-muted-foreground">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-primary">
                        Instructions de secours <ChevronDown size={13} />
                      </summary>
                      <p className="mt-3 mb-2 leading-relaxed">{plan.manual.steps}</p>
                      <pre className="max-h-[210px] overflow-auto rounded-xl border border-border bg-muted p-3 font-mono text-[11px] whitespace-pre-wrap break-all">
                        {plan.manual.snippet}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="py-9 text-center text-[12px] text-muted-foreground">
                Aucun assistant compatible n’a été détecté.
              </p>
            )
          ) : existing.length ? (
            existing.map((agent, i) => (
              <div
                key={agent.agent}
                className="flex items-center justify-between gap-3 border-b border-border py-[17px] last:border-0"
              >
                <PersonLine
                  name={agent.label}
                  description={agent.dropInstalled ? 'Drop est déjà connecté' : 'Non raccordé à Drop'}
                  accent={(i % 4) as 0 | 1 | 2 | 3}
                />
                {agent.dropInstalled ? (
                  <CheckCircle2
                    size={19}
                    className="shrink-0 text-[#61947e] dark:text-[#99c5a6]"
                    aria-label="Connecté"
                  />
                ) : (
                  <span className="text-[11px] text-muted-foreground">Non connecté</span>
                )}
              </div>
            ))
          ) : (
            <p className="py-10 text-center text-[12px] text-muted-foreground">
              Lance l’analyse pour retrouver tes assistants.
            </p>
          )}
        </CardContent>
      </Card>
      {preview && ready.length ? (
        <Card className="border-primary/25">
          <CardContent className="flex flex-col items-start justify-between gap-4 px-6 py-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-[13px] font-semibold">Confirmer le raccordement</p>
              <p className="mt-1 max-w-[420px] text-[12px] leading-relaxed text-muted-foreground">
                Ajouter Drop à tes assistants sélectionnés ne partage aucun outil. Tu devras les redémarrer pour
                terminer la connexion.
              </p>
            </div>
            <Button
              disabled={busy || !selected.length}
              onClick={() => {
                const selections = ready
                  .filter((p) => selected.includes(p.agent))
                  .map((p) => ({ agent: p.agent, fingerprint: p.fingerprint, action: 'connect' as const }));
                act(
                  () => api('POST', '/ui/admin/onboarding', { selections }),
                  'Connecteurs ajoutés. Redémarre tes assistants pour vérifier leur connexion.',
                  () => {
                    setPreview(null);
                  },
                );
              }}
            >
              Connecter {selected.length ? '(' + String(selected.length) + ')' : ''} <ArrowUpRight size={15} />
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {preview?.manual ? (
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#6c9a83]" />
          Pour un assistant non détecté, une configuration MCP manuelle reste disponible dans le panneau historique.
        </p>
      ) : null}
      <Dialog
        open={Boolean(disconnect)}
        onOpenChange={(open) => {
          if (!open) setDisconnect(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Déconnecter {disconnect?.label} ?</DialogTitle>
            <DialogDescription>
              Drop retirera uniquement son connecteur connu. Les autres réglages de ton assistant resteront inchangés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDisconnect(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (!disconnect) return;
                const plan = disconnect;
                act(
                  () =>
                    api('POST', '/ui/admin/onboarding', {
                      selections: [{ agent: plan.agent, fingerprint: plan.fingerprint, action: 'disconnect' }],
                    }),
                  'Connecteur retiré.',
                  () => {
                    setDisconnect(null);
                    setPreview(null);
                  },
                );
              }}
            >
              Déconnecter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
