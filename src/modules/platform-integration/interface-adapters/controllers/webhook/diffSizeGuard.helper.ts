import type { ApprovalRevocationGateway } from '@/modules/platform-integration/entities/approvalRevocation/approvalRevocation.gateway.js';
import type { NoteCommentPostGateway } from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { GuardDiffSizeUseCase } from '@/modules/platform-integration/usecases/guardDiffSize.usecase.js';

type DiffSizeGuardMode = 'review' | 'followup' | 'approve';

interface DiffSizeGuardLogger {
  warn(payload: object, message: string): void;
  info(payload: object, message: string): void;
}

interface DiffSizeGuardDependencies {
  guardDiffSize: Pick<GuardDiffSizeUseCase, 'execute'>;
  getMaxDiffLines: (localPath: string) => number;
  noteCommentPostGateway: NoteCommentPostGateway;
  approvalRevocationGateway: ApprovalRevocationGateway;
}

interface ApplyDiffSizeGuardInput {
  projectIdentifier: string;
  localPath: string;
  mergeRequestNumber: number;
  mode: DiffSizeGuardMode;
  deps: DiffSizeGuardDependencies;
  revokeArgs?: { reviewId?: number; dismissalMessage?: string };
  logger: DiffSizeGuardLogger;
}

async function revokeApproval(input: ApplyDiffSizeGuardInput): Promise<void> {
  try {
    await input.deps.approvalRevocationGateway.revoke({
      projectPath: input.projectIdentifier,
      mrNumber: input.mergeRequestNumber,
      reviewId: input.revokeArgs?.reviewId,
      dismissalMessage: input.revokeArgs?.dismissalMessage,
    });
  } catch (error) {
    input.logger.warn(
      {
        mrNumber: input.mergeRequestNumber,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to revoke approval on oversized MR; continuing with FR comment',
    );
  }
}

async function postSplitComment(input: ApplyDiffSizeGuardInput, message: string): Promise<void> {
  try {
    await input.deps.noteCommentPostGateway.postComment({
      projectPath: input.projectIdentifier,
      mrNumber: input.mergeRequestNumber,
      body: message,
    });
  } catch (error) {
    input.logger.warn(
      {
        mrNumber: input.mergeRequestNumber,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to post FR split comment on oversized MR',
    );
  }
}

export type DiffSizeGuardResult =
  | { blocked: false }
  | { blocked: true; countedLines: number; budget: number; message: string };

export async function applyDiffSizeGuard(
  input: ApplyDiffSizeGuardInput,
): Promise<DiffSizeGuardResult> {
  const budget = input.deps.getMaxDiffLines(input.localPath);
  const verdict = input.deps.guardDiffSize.execute({
    projectIdentifier: input.projectIdentifier,
    mergeRequestNumber: input.mergeRequestNumber,
    budget,
  });

  if (verdict.kind === 'allowed') {
    return { blocked: false };
  }

  if (input.mode === 'approve') {
    await revokeApproval(input);
    await postSplitComment(input, verdict.message);
  } else if (input.mode === 'review') {
    await postSplitComment(input, verdict.message);
  }

  input.logger.info(
    {
      mrNumber: input.mergeRequestNumber,
      mode: input.mode,
      countedLines: verdict.countedLines,
      budget: verdict.budget,
    },
    'Merge request blocked for oversized diff',
  );

  return {
    blocked: true,
    countedLines: verdict.countedLines,
    budget: verdict.budget,
    message: verdict.message,
  };
}
