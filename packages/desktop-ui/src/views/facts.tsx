import { useState } from 'react';
import { ArrowRight, CalendarClock, Plus } from 'lucide-react';
import { api } from '../api.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Input } from '../components/ui/input.tsx';
import { Textarea } from '../components/ui/textarea.tsx';
import { Badge } from '../components/ui/badge.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import { shortDate } from '../lib/format.ts';
import type { Fact } from '../types.ts';
import type { ViewProps } from '../App.tsx';

interface Draft {
  factId?: string;
  topic: string;
  statement: string;
  keywords: string;
  source: string;
  url: string;
  validDays: number;
  audience: 'team' | 'peers';
  nodeIds: string[];
}
const fresh = (): Draft => ({
  topic: '',
  statement: '',
  keywords: '',
  source: '',
  url: '',
  validDays: 30,
  audience: 'team',
  nodeIds: [],
});
const draftFrom = (fact: Fact): Draft => ({
  factId: fact.factId,
  topic: fact.topic,
  statement: fact.statement,
  keywords: fact.keywords.join(', '),
  source: fact.source.label,
  url: fact.source.url ?? '',
  validDays: Math.max(1, Math.min(365, Math.round((fact.validTo - fact.publishedAt) / 86400000))),
  audience: fact.audience.kind,
  nodeIds: fact.audience.kind === 'peers' ? [...fact.audience.nodeIds] : [],
});
function SmallLabel({ text, htmlFor }: { text: string; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[12px] font-medium text-foreground">
      {text}
    </label>
  );
}
export function FactsView({ data, busy, act }: ViewProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [retire, setRetire] = useState<Fact | null>(null);
  const [formError, setFormError] = useState('');
  const facts = data.facts?.facts ?? [];
  const peers = data.facts?.peers ?? [];
  const update = (part: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...part } : prev));
  };
  const shareWith = (fact: Fact): string =>
    fact.audience.kind === 'team'
      ? 'Toute l’équipe'
      : fact.audience.nodeIds.map((id) => peers.find((p) => p.nodeId === id)?.displayName || 'un membre').join(', ');

  function save(): void {
    if (!draft) return;
    if (!draft.topic.trim() || !draft.statement.trim() || !draft.source.trim()) {
      setFormError('Indique le sujet, l’information et sa source.');
      return;
    }
    if (draft.audience === 'peers' && !draft.nodeIds.length) {
      setFormError('Choisis au moins une personne.');
      return;
    }
    if (!Number.isInteger(draft.validDays) || draft.validDays < 1 || draft.validDays > 365) {
      setFormError('La durée doit être comprise entre 1 et 365 jours.');
      return;
    }
    const words = draft.keywords
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean);
    if (words.length > 8) {
      setFormError('8 mots-clés au maximum.');
      return;
    }
    const body = {
      topic: draft.topic.trim(),
      statement: draft.statement.trim(),
      keywords: words,
      source: draft.url.trim() ? { label: draft.source.trim(), url: draft.url.trim() } : { label: draft.source.trim() },
      validDays: draft.validDays,
      audience: draft.audience === 'team' ? { kind: 'team' } : { kind: 'peers', nodeIds: draft.nodeIds },
    };
    act(
      () => api('POST', draft.factId ? '/ui/facts/' + draft.factId : '/ui/facts', body),
      draft.factId
        ? 'Fait modifié.'
        : 'Fait publié. Les prochaines questions compatibles pourront recevoir cette information.',
      () => {
        setDraft(null);
      },
    );
  }
  return (
    <div className="space-y-6">
      <div className="surface-warm rounded-[22px] px-7 py-7 sm:px-8">
        <p className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#797092] dark:text-[#c7bcdf]">
          <CalendarClock size={16} /> Jusqu’à la date que tu choisis.
        </p>
        <h2 className="text-[19px] font-semibold tracking-[-.042em]">
          Certaines réponses peuvent être partagées à l’avance.
        </h2>
        <p className="mt-2 max-w-[650px] text-[13px] leading-relaxed text-muted-foreground">
          Un fait publié est transmis tel quel à son public, sans te redemander à chaque fois. Tu choisis l’information,
          les destinataires et sa durée de validité.
        </p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-semibold">Faits publiés</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {facts.filter((fact) => fact.live && fact.status === 'active').length} encore disponibles
          </p>
        </div>
        <Button
          onClick={() => {
            setDraft(fresh());
            setFormError('');
          }}
        >
          <Plus size={16} /> Publier un fait
        </Button>
      </div>
      <Card>
        <CardContent className="px-6 py-2 sm:px-7">
          {facts.length ? (
            facts.map((fact) => {
              const active = fact.live && fact.status === 'active';
              return (
                <article
                  key={fact.factId}
                  className="flex flex-col justify-between gap-4 border-b border-border py-5 last:border-0 sm:flex-row sm:gap-5"
                >
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-3">
                      <h3 className="text-[13px] font-semibold">{fact.topic}</h3>
                      <Badge tone={active ? 'success' : 'neutral'}>
                        {active ? 'Disponible' : fact.status === 'retired' ? 'Retiré' : 'Expiré'}
                      </Badge>
                    </div>
                    <p className="max-w-[600px] text-[12.5px] leading-[1.65] text-muted-foreground">{fact.statement}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {fact.source.label} · {shareWith(fact)} ·{' '}
                      {active ? 'Jusqu’au ' + shortDate(fact.validTo) : 'Non servi'}
                    </p>
                  </div>
                  {fact.status === 'active' ? (
                    <div className="flex shrink-0 gap-2 self-start">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDraft(draftFrom(fact));
                          setFormError('');
                        }}
                      >
                        Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          setRetire(fact);
                        }}
                      >
                        Retirer
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className="py-12 text-center">
              <p className="text-[14px] font-semibold">Tu n’as encore rien publié.</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Une information stable peut éviter de redemander plusieurs fois la même chose.
              </p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setDraft(fresh());
                }}
              >
                Créer mon premier fait <ArrowRight size={15} />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{draft?.factId ? 'Modifier ce fait' : 'Publier un fait'}</DialogTitle>
            <DialogDescription>
              Choisis précisément ce qui pourra être transmis. Les informations seront servies telles quelles jusqu’à
              leur expiration.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div>
                <SmallLabel text="Sujet" htmlFor="fact-topic" />
                <Input
                  id="fact-topic"
                  maxLength={120}
                  value={draft.topic}
                  placeholder="Ex. Nouvelle version du produit"
                  onChange={(e) => {
                    update({ topic: e.target.value });
                  }}
                />
              </div>
              <div>
                <SmallLabel text="Information à partager" htmlFor="fact-content" />
                <Textarea
                  id="fact-content"
                  maxLength={1000}
                  value={draft.statement}
                  placeholder="Écris une réponse claire…"
                  onChange={(e) => {
                    update({ statement: e.target.value });
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <SmallLabel text="Source" htmlFor="fact-source" />
                  <Input
                    id="fact-source"
                    maxLength={200}
                    value={draft.source}
                    placeholder="Ex. Roadmap du projet"
                    onChange={(e) => {
                      update({ source: e.target.value });
                    }}
                  />
                </div>
                <div>
                  <SmallLabel text="Valable (jours)" htmlFor="fact-valid" />
                  <Input
                    id="fact-valid"
                    type="number"
                    min="1"
                    max="365"
                    value={draft.validDays}
                    onChange={(e) => {
                      update({ validDays: Number(e.target.value) });
                    }}
                  />
                </div>
              </div>
              <details className="rounded-xl border border-border px-4 py-3 text-[12px] text-muted-foreground">
                <summary className="cursor-pointer font-medium text-primary">
                  Options supplémentaires (facultatif)
                </summary>
                <div className="mt-4 space-y-4">
                  <div>
                    <SmallLabel text="Lien de source (facultatif)" htmlFor="fact-url" />
                    <Input
                      id="fact-url"
                      type="url"
                      maxLength={500}
                      value={draft.url}
                      placeholder="https://…"
                      onChange={(e) => {
                        update({ url: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <SmallLabel text="Mots-clés (facultatif)" htmlFor="fact-keywords" />
                    <Input
                      id="fact-keywords"
                      maxLength={330}
                      value={draft.keywords}
                      placeholder="design, sortie, version"
                      onChange={(e) => {
                        update({ keywords: e.target.value });
                      }}
                    />
                  </div>
                </div>
              </details>
              <fieldset className="rounded-xl border border-border px-4 py-3">
                <legend className="px-1 text-[12px] font-medium">Destinataires</legend>
                <label className="flex items-center gap-2 py-2 text-[12px]">
                  <input
                    name="audience"
                    type="radio"
                    checked={draft.audience === 'team'}
                    onChange={() => {
                      update({ audience: 'team' });
                    }}
                    className="accent-primary"
                  />{' '}
                  Toute l’équipe
                </label>
                <label className="flex items-center gap-2 py-2 text-[12px]">
                  <input
                    name="audience"
                    type="radio"
                    checked={draft.audience === 'peers'}
                    onChange={() => {
                      update({ audience: 'peers' });
                    }}
                    className="accent-primary"
                  />{' '}
                  Personnes choisies
                </label>
                {draft.audience === 'peers' ? (
                  <div className="mt-1 max-h-[130px] space-y-2 overflow-y-auto border-t border-border py-3">
                    {peers.length ? (
                      peers.map((p) => (
                        <label key={p.nodeId} className="flex items-center gap-2 text-[12px]">
                          <Checkbox
                            checked={draft.nodeIds.includes(p.nodeId)}
                            onCheckedChange={(value) => {
                              update({
                                nodeIds:
                                  value === true
                                    ? [...new Set([...draft.nodeIds, p.nodeId])]
                                    : draft.nodeIds.filter((id) => id !== p.nodeId),
                              });
                            }}
                          />
                          {p.displayName}
                        </label>
                      ))
                    ) : (
                      <span className="text-[12px] text-muted-foreground">Aucun membre disponible.</span>
                    )}
                  </div>
                ) : null}
              </fieldset>
              <div className="rounded-xl border border-[#eee1d4] bg-[#fbf6ef] px-4 py-3 text-[12px] leading-relaxed text-[#805f3d] dark:border-[#645443] dark:bg-[#413830] dark:text-[#ecd1a6]">
                <strong>Publication automatique :</strong> Drop pourra servir cette information à ce public sans
                demander de nouvel accord jusqu’à la date de fin.
              </div>
              {formError ? (
                <p role="alert" className="text-xs text-destructive">
                  {formError}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(null);
              }}
            >
              Annuler
            </Button>
            <Button disabled={busy} onClick={save}>
              {draft?.factId ? 'Enregistrer' : 'Publier ce fait'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(retire)}
        onOpenChange={(open) => {
          if (!open) setRetire(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirer ce fait ?</DialogTitle>
            <DialogDescription>
              « {retire?.topic} » ne sera plus servi aux prochaines questions. Les réponses déjà reçues ne peuvent pas
              être rappelées.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRetire(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (retire)
                  act(
                    () => api('POST', '/ui/facts/' + retire.factId + '/retire', {}),
                    'Fait retiré.',
                    () => {
                      setRetire(null);
                    },
                  );
              }}
            >
              Retirer le fait
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
