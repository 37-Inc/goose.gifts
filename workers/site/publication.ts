import type { CatalogSnapshot } from '../../lib/catalog/types.ts';
import type { CatalogD1 } from '../../lib/catalog/storage/d1.ts';
import { claimPublication, completePublication, enqueuePublication, failPublication, publicationStatus, recordPublicationDispatch } from '../../lib/catalog/publication.ts';
import type { PublicationClaim, PublicationIntent } from '../../lib/catalog/publication.ts';

async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, timeout: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('publication_adapter_timeout')); }, timeout);
    })]);
  } finally { clearTimeout(timer); }
}
/** Provider-neutral orchestration only: no HTTP route, scheduler, credentials or real adapter is activated. */
export function createPublicationController(options: {
  db: CatalogD1;
  dispatch(claim: PublicationClaim, signal: AbortSignal): Promise<{ reference: string }>;
  readDeployed(intent: PublicationIntent, signal: AbortSignal): Promise<PublicationIntent>;
  now?: () => number; leaseMs?: number; adapterTimeoutMs?: number;
}) {
  const now = () => new Date((options.now || Date.now)());
  const timeout = Math.max(10, Math.min(options.adapterTimeoutMs ?? 3000, 5000));
  return {
    async request(snapshot: CatalogSnapshot, intent: PublicationIntent) {
      await enqueuePublication(options.db, snapshot, intent, now());
      const claim = await claimPublication(options.db, snapshot, intent.releaseId, now(), options.leaseMs);
      if (claim) {
        try {
          const accepted = await bounded((signal) => options.dispatch(claim, signal), timeout);
          await recordPublicationDispatch(options.db, snapshot, claim, accepted.reference, now());
        } catch { await failPublication(options.db, intent.releaseId, claim.token, now()); }
      }
      return publicationStatus(options.db, intent.releaseId);
    },
    async complete(snapshot: CatalogSnapshot, releaseId: string, token: string) {
      await completePublication(options.db, snapshot, releaseId, token,
        (intent) => bounded((signal) => options.readDeployed(intent, signal), timeout), now);
      return publicationStatus(options.db, releaseId);
    },
    status: (releaseId: string) => publicationStatus(options.db, releaseId),
  };
}
