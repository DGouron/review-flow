import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import type {
  ReviewBrief,
  ReviewBriefModelOutput,
  ReviewBriefSize,
} from '@/modules/review-brief/entities/reviewBrief/reviewBrief.schema.js';
import type {
  ReviewBriefCacheGateway,
  ReviewBriefCacheKey,
} from '@/modules/review-brief/entities/reviewBrief/reviewBriefCache.gateway.js';
import type { ReviewBriefModelGateway } from '@/modules/review-brief/entities/reviewBrief/reviewBriefModel.gateway.js';
import type {
  ReviewRequestOverview,
  ReviewRequestOverviewFetchGateway,
} from '@/modules/review-brief/entities/reviewBrief/reviewRequestOverview.gateway.js';
import {
  buildReviewBriefPrompt,
  parseReviewBriefModelOutput,
} from '@/modules/review-brief/usecases/explainReviewRequest/reviewBriefPrompt.js';
import type { ReviewFileGateway } from '@/modules/review-execution/entities/review/reviewFile.gateway.js';
import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';
import type { ChangedFilesFetchGateway } from '@/modules/shared-kernel/entities/diffSizeGate/changedFilesFetch.gateway.js';
import type { ChangedFile } from '@/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type {
  Platform,
  ReviewRequestTrackingGateway,
} from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface ExplainReviewRequestDependencies {
  trackingGateway: ReviewRequestTrackingGateway;
  overviewFetchFor: (platform: Platform) => ReviewRequestOverviewFetchGateway;
  changedFilesFetchFor: (platform: Platform) => ChangedFilesFetchGateway;
  threadFetchFor: (platform: Platform) => ThreadFetchGateway;
  reviewFileGateway: ReviewFileGateway;
  modelGateway: ReviewBriefModelGateway;
  cacheGateway: ReviewBriefCacheGateway;
  now: () => Date;
}

export type ExplainReviewRequestInput = {
  localPath: string;
  mrNumber: number;
  refresh: boolean;
  language: Language;
};

export type ExplainReviewRequestResult =
  | { status: 'explained'; brief: ReviewBrief }
  | { status: 'not-tracked' }
  | { status: 'generation-failed'; reason: string };

type GenerationContext = {
  input: ExplainReviewRequestInput;
  trackedRequest: TrackedMr;
  overview: ReviewRequestOverview;
  cacheKey: ReviewBriefCacheKey;
};

type ModelOutcome =
  | { status: 'parsed'; value: ReviewBriefModelOutput }
  | { status: 'failed'; reason: string };

function generationFailed(reason: string): ExplainReviewRequestResult {
  return { status: 'generation-failed', reason };
}

function generationKeyOf(cacheKey: ReviewBriefCacheKey): string {
  return JSON.stringify([
    cacheKey.localPath,
    cacheKey.platform,
    cacheKey.mrNumber,
    cacheKey.headSha,
    cacheKey.language,
  ]);
}

function sizeOf(changedFiles: ChangedFile[]): ReviewBriefSize {
  return {
    additions: changedFiles.reduce((total, file) => total + file.additions, 0),
    deletions: changedFiles.reduce((total, file) => total + file.deletions, 0),
    changedFiles: changedFiles.length,
  };
}

/**
 * Explains one tracked review request: reads its material from the platform and the review
 * reports, asks the model for a brief, validates it and caches it per head sha and language.
 * Concurrent calls for the same cache key share one generation. Never writes to the platform.
 */
export class ExplainReviewRequestUseCase implements UseCase<
  ExplainReviewRequestInput,
  Promise<ExplainReviewRequestResult>
> {
  private readonly generationsInFlight = new Map<string, Promise<ExplainReviewRequestResult>>();

  constructor(private readonly dependencies: ExplainReviewRequestDependencies) {}

  async execute(input: ExplainReviewRequestInput): Promise<ExplainReviewRequestResult> {
    const trackedRequest =
      this.dependencies.trackingGateway
        .loadTracking(input.localPath)
        ?.mrs.find((mr) => mr.mrNumber === input.mrNumber) ?? null;
    if (trackedRequest === null) {
      return { status: 'not-tracked' };
    }
    const overview = this.dependencies
      .overviewFetchFor(trackedRequest.platform)
      .fetchOverview(trackedRequest.project, input.mrNumber);
    if (overview === null) {
      return generationFailed('overview-unavailable');
    }
    const cacheKey: ReviewBriefCacheKey = {
      localPath: input.localPath,
      platform: trackedRequest.platform,
      mrNumber: input.mrNumber,
      headSha: overview.headSha,
      language: input.language,
    };
    const cached = input.refresh ? null : await this.dependencies.cacheGateway.load(cacheKey);
    if (cached !== null) {
      return { status: 'explained', brief: cached };
    }
    return this.generateOnce({ input, trackedRequest, overview, cacheKey });
  }

  private generateOnce(context: GenerationContext): Promise<ExplainReviewRequestResult> {
    const generationKey = generationKeyOf(context.cacheKey);
    const inFlight = this.generationsInFlight.get(generationKey);
    if (inFlight !== undefined) {
      return inFlight;
    }
    const generation = this.generateThenForget(context, generationKey);
    this.generationsInFlight.set(generationKey, generation);
    return generation;
  }

  private async generateThenForget(
    context: GenerationContext,
    generationKey: string,
  ): Promise<ExplainReviewRequestResult> {
    try {
      return await this.generate(context);
    } finally {
      this.generationsInFlight.delete(generationKey);
    }
  }

  private async generate(context: GenerationContext): Promise<ExplainReviewRequestResult> {
    const { input, trackedRequest, overview, cacheKey } = context;
    const changedFiles = this.dependencies
      .changedFilesFetchFor(trackedRequest.platform)
      .fetchChangedFiles(trackedRequest.project, input.mrNumber);
    if (changedFiles === null) {
      return generationFailed('changed-files-unavailable');
    }
    const output = await this.askModel(context, changedFiles);
    if (output.status === 'failed') {
      return generationFailed(output.reason);
    }
    const brief: ReviewBrief = {
      mrNumber: input.mrNumber,
      headSha: overview.headSha,
      generatedAt: this.dependencies.now().toISOString(),
      ...output.value,
      size: sizeOf(changedFiles),
    };
    await this.dependencies.cacheGateway.save(cacheKey, brief);
    return { status: 'explained', brief };
  }

  private async askModel(
    context: GenerationContext,
    changedFiles: ChangedFile[],
  ): Promise<ModelOutcome> {
    const { input, trackedRequest, overview } = context;
    const prompt = buildReviewBriefPrompt(
      {
        title: overview.title,
        description: overview.description,
        changedFiles,
        threads: this.fetchThreads(trackedRequest),
        latestReport: await this.readLatestReport(input),
      },
      input.language,
    );
    const answer = await this.dependencies.modelGateway.generate({
      ...prompt,
      localPath: input.localPath,
    });
    if (answer.status === 'failed') {
      return answer;
    }
    const value = parseReviewBriefModelOutput(answer.text);
    return value === null
      ? { status: 'failed', reason: 'invalid-model-output' }
      : { status: 'parsed', value };
  }

  private fetchThreads(trackedRequest: TrackedMr): ReviewContextThread[] {
    try {
      return this.dependencies
        .threadFetchFor(trackedRequest.platform)
        .fetchThreads(trackedRequest.project, trackedRequest.mrNumber);
    } catch {
      return [];
    }
  }

  private async readLatestReport(input: ExplainReviewRequestInput): Promise<string | null> {
    const reviews = await this.dependencies.reviewFileGateway.listReviews(input.localPath);
    const latest = reviews.find((review) => review.mrNumber === String(input.mrNumber));
    if (latest === undefined) {
      return null;
    }
    return this.dependencies.reviewFileGateway.readReview(input.localPath, latest.filename);
  }
}
