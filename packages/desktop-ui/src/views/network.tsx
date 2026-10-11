import { useEffect, useState } from 'react';
import { CheckCircle2, Globe2, LockKeyhole, RadioTower, Wifi } from 'lucide-react';
import { api } from '../api.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import type { InternetMode } from '../types.ts';
import type { ViewProps } from '../App.tsx';

const options: Array<{ mode: InternetMode; title: string; description: string }> = [
  {
    mode: 'off',
    title: 'Réseau local seulement',
    description: 'Pour les collègues sur le même réseau. Aucun relais Internet.',
  },
  {
    mode: 'direct',
    title: 'Connexion directe',
    description: 'Sans relais, lorsque les deux appareils peuvent se joindre.',
  },
  {
    mode: 'relay',
    title: 'Relais de ton équipe',
    description: 'Utilise uniquement le relais que tu ou ton équipe avez choisi.',
  },
  {
    mode: 'n0',
    title: 'Relais public de test',
    description: 'Serveur tiers réservé aux essais, souvent interdit par le profil privé.',
  },
];
export function NetworkView({ data, busy, act }: ViewProps) {
  const saved = data.internet?.settings;
  const [mode, setMode] = useState<InternetMode>('off');
  const [relay, setRelay] = useState('');
  const [error, setError] = useState('');
  const status = data.internet?.state ?? 'unknown';

  useEffect(() => {
    if (saved) {
      setMode(saved.mode);
      setRelay(saved.relay || '');
    }
  }, [saved?.mode, saved?.relay]);
  function save(): void {
    setError('');
    if (mode === 'relay' && !relay.trim()) {
      setError('Indique l’adresse du relais de ton équipe.');
      return;
    }
    if (mode === 'relay') {
      try {
        const parsed = new URL(relay.trim());
        if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1'))
          throw Error('Le relais doit être en HTTPS (ou HTTP en local).');
      } catch {
        setError('Adresse invalide : utilise HTTPS pour le relais.');
        return;
      }
    }
    act(
      () => api('POST', '/ui/admin/internet', mode === 'relay' ? { mode, relay: relay.trim() } : { mode }),
      'Connexion mise à jour selon ton choix.',
    );
  }
  return (
    <div className="space-y-6">
      <div className="surface-warm rounded-[22px] px-7 py-7">
        <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#777091] dark:text-[#c9b9de]">
          <LockKeyhole size={17} /> Chiffrement de bout en bout.
        </div>
        <h2 className="text-[19px] font-semibold tracking-[-.035em]">Ta connexion, tes règles.</h2>
        <p className="mt-2 max-w-[610px] text-[13px] leading-relaxed text-muted-foreground">
          Drop retrouve les personnes sur ton réseau local. Pour communiquer à distance, choisis une connexion
          explicitement. Aucun serveur public n’est activé sans toi.
        </p>
      </div>
      <Card>
        <CardContent className="px-7 py-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-[#f3f0f8] text-[#6a619e] dark:bg-[#42394f] dark:text-[#c1b9f0]">
                <Wifi size={21} />
              </span>
              <div>
                <p className="text-[13px] font-semibold">Connexion actuelle</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {saved?.mode === 'off'
                    ? 'Réseau local'
                    : saved?.mode === 'relay'
                      ? 'Relais privé'
                      : saved?.mode === 'direct'
                        ? 'Directe'
                        : 'Non configurée'}
                </p>
              </div>
            </div>
            <span
              className={
                'flex items-center gap-2 text-[12px] ' +
                (status === 'on' ? 'text-[#558f72] dark:text-[#abd3b8]' : 'text-muted-foreground')
              }
            >
              {status === 'on' ? <CheckCircle2 size={17} /> : <RadioTower size={16} />}
              {status === 'on'
                ? 'Internet actif'
                : status === 'starting'
                  ? 'Connexion en cours'
                  : status === 'off'
                    ? 'Internet désactivé'
                    : status === 'failed'
                      ? 'Connexion interrompue'
                      : 'Non disponible'}
            </span>
          </div>
          <div className="border-t border-border pt-5">
            <h3 className="mb-3 text-[13px] font-semibold">Comment souhaites-tu te connecter ?</h3>
            <div className="space-y-2" role="radiogroup" aria-label="Mode de connexion Internet">
              {options.map((option) => (
                <label
                  key={option.mode}
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-[13px] border p-4 transition-colors ' +
                    (mode === option.mode
                      ? 'border-primary/35 bg-[#f5f3fb] dark:bg-[#3c364b]'
                      : 'border-border hover:bg-accent/60')
                  }
                >
                  <input
                    type="radio"
                    name="internet-mode"
                    value={option.mode}
                    checked={mode === option.mode}
                    onChange={() => {
                      setMode(option.mode);
                    }}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold">{option.title}</span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {mode === 'relay' ? (
              <div className="mt-5">
                <label htmlFor="relay-address" className="mb-2 block text-[12px] font-medium">
                  Adresse du relais
                </label>
                <Input
                  id="relay-address"
                  type="url"
                  value={relay}
                  onChange={(e) => {
                    setRelay(e.target.value);
                  }}
                  placeholder="https://relais.mon-equipe.fr"
                />
              </div>
            ) : null}
            {mode === 'n0' ? (
              <p className="mt-4 rounded-xl border border-[#e8d9c8] bg-[#fcf6ed] px-4 py-3 text-[12px] leading-relaxed text-[#8b6743] dark:bg-[#443a30] dark:text-[#e9cca6]">
                Tu fais appel à une infrastructure tierce, qui peut voir les adresses IP. Le profil privé peut refuser
                cette option.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-4 text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Les choix interdits par une politique d’entreprise restent refusés.
              </p>
              <Button disabled={busy || !data.internet} onClick={save}>
                Enregistrer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="flex items-start gap-3 px-1 text-[12px] leading-relaxed text-muted-foreground">
        <Globe2 size={18} strokeWidth={1.7} className="mt-0.5 shrink-0" />
        Le relais ne lit pas le contenu chiffré des messages Drop. Les connecteurs et modèles que tu choisis peuvent
        avoir leurs propres flux.
      </div>
    </div>
  );
}
