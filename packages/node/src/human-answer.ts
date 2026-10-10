/**
 * Hand-written answers (T4.3, D64). The same checks run on the approver's node before anything leaves and on the
 * executor before delivery: shape and limits, then the secret scanner. An answer that fails is refused, never fixed.
 */
import { DropError, HumanAnswerSchema, humanAnswerTooLarge, type HumanAnswer } from '@drop/protocol';
import { scanSecrets } from '@drop/runner';

export function checkHumanAnswer(raw: unknown): HumanAnswer {
  const candidate: Record<string, unknown> =
    typeof raw === 'object' && raw !== null
      ? { ...(raw as Record<string, unknown>), kind: 'human' }
      : { kind: 'human' };
  if (humanAnswerTooLarge(candidate))
    throw new DropError(
      'E_TOO_LARGE',
      'Réponse trop volumineuse : 8 000 caractères et un fichier texte de 128 Kio au plus, une fois encodés.',
    );
  const file = candidate.file;
  const name = typeof file === 'object' && file !== null ? (file as Record<string, unknown>).name : undefined;
  if (typeof name === 'string' && name.trim().length > 120)
    throw new DropError('E_SCHEMA', 'Nom de fichier trop long : 120 caractères au plus.');
  const parsed = HumanAnswerSchema.safeParse(candidate);
  if (!parsed.success)
    throw new DropError('E_SCHEMA', 'Réponse vide ou fichier illisible : écris un texte ou joins un fichier texte.');
  const kinds = scanSecrets(parsed.data);
  if (kinds.length > 0)
    throw new DropError(
      'E_SECRET_DETECTED',
      `Secret détecté (${kinds.join(', ')}) : retire-le de ta réponse, rien n’est parti.`,
    );
  return parsed.data;
}
