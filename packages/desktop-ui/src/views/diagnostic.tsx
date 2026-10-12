import { useState } from 'react';
import { ClipboardCopy, FolderOpen, Stethoscope } from 'lucide-react';
import { api } from '../api.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { copyText } from '../lib/clipboard.ts';
import type { ViewProps } from '../App.tsx';

interface DiagnosticData {
  text: string;
  removed: number;
  logDir: string;
}

/**
 * « Diagnostic » (T4.37): the versions, the logs folder, and a redacted diagnostic the owner reads in full before
 * copying it. drop sends nothing: the owner pastes the text into the message of his choice.
 */
export function DiagnosticView({ data, busy, act }: ViewProps) {
  const status = data.status;
  const logDir = status?.logDir ?? '';
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [copied, setCopied] = useState('');

  const copy = (text: string, done: string): void => {
    copyText(text).then(
      () => {
        setCopied(done);
      },
      () => {
        setCopied('Copie impossible : sélectionne le texte à la main.');
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="px-6 py-6">
          <div className="mb-4 flex items-center gap-2">
            <Stethoscope size={18} className="text-primary" strokeWidth={1.7} aria-hidden="true" />
            <h2 className="text-[15px] font-semibold tracking-[-.025em]">Version</h2>
          </div>
          <p className="text-[13px]">
            App {status?.version?.app ?? 'lancée hors de l’app'} · Moteur {status?.version?.engine ?? 'inconnu'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="px-6 py-6">
          <h2 className="text-[15px] font-semibold tracking-[-.025em]">Journaux</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Ce dossier ne contient que les journaux de drop, expurgés à l’écriture. L’expurgation ne reconnaît pas tout
            : relis-les avant de les envoyer.
          </p>
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 font-mono text-[12px] break-all select-all">
            {logDir || 'Chemin inconnu'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                act(() => api('POST', '/ui/admin/logs/open', {}), 'Dossier des journaux ouvert.');
              }}
            >
              <FolderOpen aria-hidden="true" /> Ouvrir le dossier
            </Button>
            <Button
              variant="secondary"
              disabled={!logDir}
              onClick={() => {
                copy(logDir, 'Chemin copié.');
              }}
            >
              <ClipboardCopy aria-hidden="true" /> Copier le chemin
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="px-6 py-6">
          <h2 className="text-[15px] font-semibold tracking-[-.025em]">Diagnostic à envoyer</h2>
          <p className="mt-1 max-w-[620px] text-[12px] leading-relaxed text-muted-foreground">
            Versions, état des connexions et fin des journaux, expurgés. drop ne l’envoie pas : tu le relis, tu le
            copies, puis tu le colles dans le message de ton choix.
          </p>
          <div className="mt-4">
            <Button
              disabled={busy}
              onClick={() => {
                setCopied('');
                act(
                  () =>
                    api<DiagnosticData>('GET', '/ui/admin/diagnostic').then((result) => {
                      setDiagnostic(result);
                    }),
                  'Diagnostic prêt : relis-le avant de le copier.',
                );
              }}
            >
              Préparer le diagnostic
            </Button>
          </div>
          {diagnostic ? (
            <div className="mt-5">
              <p className="text-[12px] text-muted-foreground">
                Relis-le en entier.{' '}
                {diagnostic.removed === 0
                  ? 'Aucune ligne retirée.'
                  : diagnostic.removed === 1
                    ? '1 ligne retirée parce qu’elle ressemblait à un secret.'
                    : String(diagnostic.removed) + ' lignes retirées parce qu’elles ressemblaient à un secret.'}
              </p>
              <textarea
                readOnly
                aria-label="Diagnostic expurgé"
                value={diagnostic.text}
                className="mt-2 h-72 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed"
              />
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => {
                  copy(diagnostic.text, 'Diagnostic copié : colle-le dans ton message.');
                }}
              >
                <ClipboardCopy aria-hidden="true" /> Copier le diagnostic
              </Button>
            </div>
          ) : null}
          <p role="status" className="mt-3 text-[12px] text-muted-foreground">
            {copied}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
