import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { enqueueBuildRequest, recordBuildDispatch } from '../../lib/catalog/build-requests.ts';
import type { CatalogBuildRequest } from '../../lib/catalog/build-requests.ts';
import { canonicalTime } from '../../lib/catalog/snapshot.ts';

/** Unbound daily check: no scheduled export, HTTP endpoint, credentials or provider
 * activation. Inputs come from reviewed compiled release context, never a request.
 * The sole external adapter requests a build; acceptance is never publication.
 */
export function createFreshnessCheck(options: {
  db: CatalogD1; environment: CatalogBuildRequest['environment']; sourceRevision: string; sourceDigest: string;
  codeSha: string; priorReleaseId: string | null; nextExpiry: string | null;
  dispatch(requestId: string, signal: AbortSignal): Promise<{ reference: string }>;
  horizonMs?: number;
}) {
  const horizon = options.horizonMs ?? 25 * 3600000;
  if (!Number.isInteger(horizon) || horizon < 60000 || horizon > 26 * 3600000) throw new Error('invalid_freshness_horizon');
  if (options.nextExpiry !== null) canonicalTime(options.nextExpiry);
  return async (scheduledAt: Date) => {
    const capturedAt = scheduledAt.toISOString();
    const cutoff = new Date(scheduledAt.getTime() + horizon).toISOString();
    if (options.nextExpiry === null || Date.parse(options.nextExpiry) > Date.parse(cutoff)) return { state: 'unchanged' as const };
    const result = await enqueueBuildRequest(options.db, { schemaVersion: 1, environment: options.environment,
      sourceRevision: options.sourceRevision, sourceDigest: options.sourceDigest, codeSha: options.codeSha,
      priorReleaseId: options.priorReleaseId, capturedAt, cutoff });
    if (!result.created) return { state: 'existing' as const, requestId: result.requestId };
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const accepted = await Promise.race([options.dispatch(result.requestId, controller.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error('dispatch_unconfirmed')); controller.abort(); }, 3000);
      })]);
      await recordBuildDispatch(options.db, result.requestId, accepted.reference);
      return { state: 'dispatched' as const, requestId: result.requestId };
    } catch {
      await recordBuildDispatch(options.db, result.requestId, null);
      return { state: 'dispatch_unconfirmed' as const, requestId: result.requestId };
    } finally { clearTimeout(timer); }
  };
}
