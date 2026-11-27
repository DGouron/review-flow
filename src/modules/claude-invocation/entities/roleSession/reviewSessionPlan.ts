import {
  isOrchestratedReview,
  orchestratedReviewTimeoutMs,
  type ReviewOrchestrationSettings,
} from '@/modules/claude-invocation/entities/roleSession/reviewOrchestration.js';
import { roleSessionNameOf } from '@/modules/claude-invocation/entities/roleSession/roleSessionName.js';

/** The argument that switches the review skill to its clerk mode. */
const ORCHESTRATED_SKILL_ARGUMENT = 'orchestre';

export type OrchestratedReviewSessionPlan = {
  orchestrated: true;
  prompt: string;
  /** The lots address their findings to this name. */
  sessionName: string;
  timeoutMs: number;
};

export type ReviewSessionPlan =
  | { orchestrated: false; prompt: string; sessionName: null; timeoutMs: number }
  | OrchestratedReviewSessionPlan;

export type ReviewSessionSubject = {
  skill: string;
  mergeRequestNumber: number;
  jobType: 'review' | 'followup';
  settings: ReviewOrchestrationSettings | null;
  singleTimeoutMs: number;
};

export function reviewSessionPlanOf(subject: ReviewSessionSubject): ReviewSessionPlan {
  const singlePrompt = `/${subject.skill} ${subject.mergeRequestNumber}`;
  if (!isOrchestratedReview(subject.settings, subject.jobType)) {
    return {
      orchestrated: false,
      prompt: singlePrompt,
      sessionName: null,
      timeoutMs: subject.singleTimeoutMs,
    };
  }
  return {
    orchestrated: true,
    prompt: `${singlePrompt} ${ORCHESTRATED_SKILL_ARGUMENT}`,
    sessionName: roleSessionNameOf(
      { jobType: 'review', mergeRequestNumber: subject.mergeRequestNumber },
      'greffe',
    ),
    timeoutMs: orchestratedReviewTimeoutMs(subject.settings),
  };
}
