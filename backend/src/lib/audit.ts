import type { Db } from '../db';
import { db } from '../db';

export async function writeAudit(
  trx: Db,
  input: {
    userId: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await trx('audit_log').insert({
    user_id: input.userId,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId ?? null,
    details: JSON.stringify(input.details ?? {})
  });
}

/** Audit an event that is not tied to an authenticated user (e.g. rate limits). */
export async function writeAuditStandalone(input: {
  action: string;
  entity?: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await db('audit_log').insert({
    user_id: null,
    action: input.action,
    entity: input.entity ?? 'system',
    entity_id: input.entityId ?? null,
    details: JSON.stringify(input.details ?? {})
  });
}
