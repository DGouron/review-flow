import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface SyncThreadsInput {
  projectPath: string;
  mrId: string;
}

export class SyncThreadsUseCase implements UseCase<SyncThreadsInput, TrackedMr | null> {
  constructor(
    private readonly trackingGateway: ReviewRequestTrackingGateway,
    private readonly threadFetchGateway: ThreadFetchGateway,
  ) {}

  execute(input: SyncThreadsInput): TrackedMr | null {
    const mr = this.trackingGateway.getById(input.projectPath, input.mrId);
    if (!mr) return null;

    const threads = this.threadFetchGateway.fetchThreads(mr.project, mr.mrNumber);
    const open = threads.filter((t) => t.status === 'open').length;
    const total = threads.length;

    const hasOpenThreads = open > 0;
    const wasPendingFix = mr.state === 'pending-fix';

    this.trackingGateway.update(input.projectPath, input.mrId, {
      openThreads: open,
      totalThreads: total,
      ...(hasOpenThreads
        ? { state: 'pending-fix' }
        : wasPendingFix
          ? { state: 'pending-approval' }
          : {}),
    });

    return this.trackingGateway.getById(input.projectPath, input.mrId) ?? null;
  }
}
