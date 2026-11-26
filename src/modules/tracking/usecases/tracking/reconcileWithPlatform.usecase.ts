import type { ReviewRequestStateFetchGateway } from '@/modules/platform-integration/entities/reviewRequestState/reviewRequestStateFetch.gateway.js';
import type { SyncSummaryGateway } from '@/modules/tracking/entities/platformSync/syncSummary.gateway.js';
import type { SyncSummary } from '@/modules/tracking/entities/platformSync/syncSummary.js';
import type {
  Platform,
  ReviewRequestTrackingGateway,
} from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface ReconcileWithPlatformInput {
  localPath: string;
  project: string;
}

interface ReconcileWithPlatformDependencies {
  platform: Platform;
  trackingGateway: ReviewRequestTrackingGateway;
  reviewRequestStateFetchGateway: ReviewRequestStateFetchGateway;
  syncSummaryGateway: SyncSummaryGateway;
  now: () => Date;
}

export class ReconcileWithPlatformUseCase implements UseCase<
  ReconcileWithPlatformInput,
  SyncSummary
> {
  constructor(private readonly dependencies: ReconcileWithPlatformDependencies) {}

  execute(input: ReconcileWithPlatformInput): SyncSummary {
    const { trackingGateway, reviewRequestStateFetchGateway, syncSummaryGateway, platform } =
      this.dependencies;
    const syncedAt = this.dependencies.now().toISOString();
    const openNumbers = new Set(reviewRequestStateFetchGateway.listOpenNumbers(input.project));
    const activeMrs = trackingGateway
      .getActiveMrs(input.localPath)
      .filter((mr) => mr.platform === platform);

    const removedClosed = activeMrs
      .filter((mr) => !openNumbers.has(mr.mrNumber))
      .filter((mr) => this.fileUnderPlatformState(input.localPath, mr, syncedAt)).length;

    const activeNumbers = new Set(activeMrs.map((mr) => mr.mrNumber));
    const untrackedOpen = [...openNumbers].filter((number) => !activeNumbers.has(number)).length;

    const summary: SyncSummary = { syncedAt, removedClosed, untrackedOpen };
    syncSummaryGateway.save(input.localPath, summary);
    return summary;
  }

  private fileUnderPlatformState(localPath: string, mr: TrackedMr, syncedAt: string): boolean {
    const platformState = this.dependencies.reviewRequestStateFetchGateway.fetchState(
      mr.project,
      mr.mrNumber,
    );

    if (platformState === 'merged') {
      this.dependencies.trackingGateway.update(localPath, mr.id, {
        state: 'merged',
        mergedAt: syncedAt,
      });
      return true;
    }

    if (platformState === 'closed') {
      this.dependencies.trackingGateway.update(localPath, mr.id, { state: 'closed' });
      return true;
    }

    return false;
  }
}
