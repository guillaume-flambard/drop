import { useState } from 'react';
import { copyText } from '../lib/clipboard.ts';
import { detailsText, type ErrorInfo } from '../lib/errors.ts';

/** A failure in « Ton espace » (T4.37): a sentence, then the technical details, folded and copyable. Text only. */
export function ErrorNotice({ error, onClose }: { error: ErrorInfo; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  const details = error.details;
  return (
    <div
      role="alert"
      className="mb-6 rounded-xl border border-[#ddb7b8] bg-[#fdf7f7] px-4 py-3 text-[12px] text-[#9b5054] dark:bg-[#482f33] dark:text-[#f0b8b8]"
    >
      <div className="flex items-start justify-between gap-4">
        <span>{error.sentence}</span>
        <button type="button" className="underline" onClick={onClose}>
          Fermer
        </button>
      </div>
      {details ? (
        <details className="mt-2">
          <summary className="cursor-pointer">Détails techniques</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
            {details.code ? (
              <>
                <dt>Code</dt>
                <dd>{details.code}</dd>
              </>
            ) : null}
            {details.status ? (
              <>
                <dt>Statut HTTP</dt>
                <dd>{String(details.status)}</dd>
              </>
            ) : null}
            {details.route ? (
              <>
                <dt>Route</dt>
                <dd>{details.route}</dd>
              </>
            ) : null}
          </dl>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() => {
              copyText(detailsText(error)).then(
                () => {
                  setCopied('Détails copiés.');
                },
                () => {
                  setCopied('Copie impossible : sélectionne le texte à la main.');
                },
              );
            }}
          >
            Copier les détails
          </button>
          <span role="status" className="ml-2">
            {copied}
          </span>
        </details>
      ) : null}
    </div>
  );
}
