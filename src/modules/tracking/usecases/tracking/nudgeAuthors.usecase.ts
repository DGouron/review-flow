import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
import type { TrackedMr } from '@/modules/tracking/entities/tracking/trackedMr.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

type NudgeLanguage = 'en' | 'fr';

interface NudgeAuthorsInput {
  projectPath: string;
  mrIds: string[];
  language: NudgeLanguage;
}

interface NudgeAuthorsOutput {
  nudged: number[];
  failed: number[];
}

const REMINDER_BY_LANGUAGE: Record<NudgeLanguage, string> = {
  en: 'this pull request has had no activity for more than 30 days. Is it still relevant? If so, push an update or say what is blocking it; if not, consider closing it.',
  fr: "cette PR n'a pas bougé depuis plus de 30 jours. Est-elle toujours d'actualité ? Si oui, pousse une mise à jour ou dis ce qui la bloque ; sinon, pense à la fermer.",
};

function reminderFor(mergeRequest: TrackedMr, language: NudgeLanguage): string {
  const reminder = REMINDER_BY_LANGUAGE[language];
  const author = mergeRequest.author?.username;
  if (!author) return reminder.charAt(0).toUpperCase() + reminder.slice(1);
  return `@${author}, ${reminder}`;
}

export class NudgeAuthorsUseCase implements UseCase<
  NudgeAuthorsInput,
  Promise<NudgeAuthorsOutput>
> {
  constructor(
    private readonly trackingGateway: ReviewRequestTrackingGateway,
    private readonly noteCommentPostGatewayFactory: (
      platform: TrackedMr['platform'],
    ) => NoteCommentPostGateway,
  ) {}

  async execute(input: NudgeAuthorsInput): Promise<NudgeAuthorsOutput> {
    const output: NudgeAuthorsOutput = { nudged: [], failed: [] };
    for (const mrId of input.mrIds) {
      const mergeRequest = this.trackingGateway.getById(input.projectPath, mrId);
      if (!mergeRequest) continue;
      try {
        await this.noteCommentPostGatewayFactory(mergeRequest.platform).postComment({
          projectPath: mergeRequest.project,
          mrNumber: mergeRequest.mrNumber,
          body: reminderFor(mergeRequest, input.language),
        });
        output.nudged.push(mergeRequest.mrNumber);
      } catch {
        output.failed.push(mergeRequest.mrNumber);
      }
    }
    return output;
  }
}
