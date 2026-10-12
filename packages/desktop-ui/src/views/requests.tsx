/**
 * « Demandes » in the workspace window (T4.35): the same list and the same consent card as the panel, kept up to date
 * by the Node's event stream. The Node decides; this page shows and asks.
 */
import { PendingList } from '../consent/pending-list.tsx';
import { Loading } from '../panel/ui.tsx';
import type { ViewProps } from '../App.tsx';

export function RequestsView({ data, pendingFailed }: ViewProps) {
  if (!data.pending) {
    if (!pendingFailed) return <Loading />;
    return (
      <p role="alert" className="text-[12px] text-muted-foreground">
        Impossible de lire les demandes. Vérifie que drop est ouvert, puis actualise.
      </p>
    );
  }
  return (
    <section aria-label="Demandes à décider" className="max-w-[560px]">
      <PendingList pending={data.pending} active />
    </section>
  );
}
