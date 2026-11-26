import type { EmberAnswerTransportGateway } from '@/modules/ember-chat/entities/emberAnswer/emberAnswerTransport.gateway.js';
import type {
  ReviewBriefModelGateway,
  ReviewBriefModelRequest,
  ReviewBriefModelResult,
} from '@/modules/review-brief/entities/reviewBrief/reviewBriefModel.gateway.js';

export interface ReviewBriefModelEmberGatewayOptions {
  timeoutMs?: number;
}

type BriefRun =
  | { status: 'started'; outcome: Promise<ReviewBriefModelResult>; cancel: () => void }
  | { status: 'failed'; reason: string };

type Countdown = { elapsed: Promise<'timeout'>; stop: () => void };

const DEFAULT_TIMEOUT_MS = 55_000;

function startCountdown(milliseconds: number): Countdown {
  let timer: NodeJS.Timeout | null = null;
  const elapsed = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), milliseconds);
  });
  return {
    elapsed,
    stop: () => {
      if (timer !== null) clearTimeout(timer);
    },
  };
}

/**
 * Generates a brief through Ember's Claude transport: one run per brief, chunks concatenated,
 * resolved when the run is done. A run that does not finish within the timeout is cancelled.
 */
export class ReviewBriefModelEmberGateway implements ReviewBriefModelGateway {
  private readonly timeoutMs: number;

  constructor(
    private readonly transport: EmberAnswerTransportGateway,
    options: ReviewBriefModelEmberGatewayOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generate(request: ReviewBriefModelRequest): Promise<ReviewBriefModelResult> {
    const run = this.startRun(request);
    if (run.status === 'failed') {
      return run;
    }
    const countdown = startCountdown(this.timeoutMs);
    const winner = await Promise.race([run.outcome, countdown.elapsed]);
    countdown.stop();
    if (winner === 'timeout') {
      run.cancel();
      return { status: 'failed', reason: 'review-brief-timeout' };
    }
    return winner;
  }

  private startRun(request: ReviewBriefModelRequest): BriefRun {
    let settle: ((result: ReviewBriefModelResult) => void) | null = null;
    const outcome = new Promise<ReviewBriefModelResult>((resolve) => {
      settle = resolve;
    });
    let text = '';
    const started = this.transport.start(
      {
        question: request.material,
        systemPrompt: request.systemPrompt,
        projectPath: request.localPath,
      },
      {
        onChunk: (chunk) => {
          text += chunk;
        },
        onDone: () => settle?.({ status: 'completed', text }),
        onError: (reason) => settle?.({ status: 'failed', reason }),
      },
    );
    if (started.status === 'failed') {
      return started;
    }
    return { status: 'started', outcome, cancel: () => started.run.cancel() };
  }
}
