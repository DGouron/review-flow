import type { ReviewJob } from '@/modules/review-execution/entities/job/reviewJob.js';
import type {
  PendingReviewRequest,
  TriggerSource,
} from '@/modules/review-execution/entities/pendingReviewRequest/pendingReviewRequest.schema.js';
import type { GateClaudeInvocationProcessor } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';

export type ProcessorBuilder = (job: ReviewJob) => GateClaudeInvocationProcessor;

export interface ProcessorKey {
  triggerSource: TriggerSource;
  platform: 'gitlab' | 'github';
  jobType: 'review' | 'followup';
}

function buildRegistryKey(key: ProcessorKey): string {
  return `${key.triggerSource}:${key.platform}:${key.jobType}`;
}

export class ProcessorRegistry {
  private readonly builders = new Map<string, ProcessorBuilder>();

  register(key: ProcessorKey, builder: ProcessorBuilder): void {
    this.builders.set(buildRegistryKey(key), builder);
  }

  resolve(pending: PendingReviewRequest): GateClaudeInvocationProcessor {
    const key = buildRegistryKey({
      triggerSource: pending.triggerSource,
      platform: pending.platform,
      jobType: pending.jobType,
    });
    const builder = this.builders.get(key);
    if (!builder) {
      const available = [...this.builders.keys()].join(', ') || '(none)';
      throw new Error(
        `No processor builder registered for key "${key}". Available keys: ${available}`,
      );
    }
    return builder(pending.job);
  }
}
