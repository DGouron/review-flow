import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

export interface PinnedThreadFetchTarget {
  projectPath: string;
  mrNumber: number;
}

interface ResolvedRepository {
  projectPath: string;
}

export interface ResolvePinnedThreadFetchTargetInput {
  payloadProjectPath: string;
  payloadMrNumber: number;
  findRepository: (projectPath: string) => ResolvedRepository | null | undefined;
  gatedMrNumber: number | null;
}

/**
 * Anchors the (projectPath, mrNumber) pair driving fetchThreads to a server-validated
 * source (AC9). The forgeable webhook payload is never used as-is to widen scope:
 * - projectPath MUST resolve to a configured repository (live, enforced today).
 * - mrNumber MUST equal the merge-request that passed the upstream trusted-actor gate.
 * If either cannot be established, the action surface is empty (null, fail-closed).
 *
 * AC9 placeholder: the SPEC-197 trusted-actor gate currently validates {username, projectPath}
 * and carries no distinct server-validated MR identity, so callers pass gatedMrNumber = the
 * payload mrNumber and the equality check is a structural no-op until a gated-MR id is threaded
 * through ReviewJob. The true MR pin lands with SPEC-197; the project-recognition half is the
 * live fail-closed guard today. See docs/specs/196 AC9.
 */
export function resolvePinnedThreadFetchTarget(
  input: ResolvePinnedThreadFetchTargetInput,
): PinnedThreadFetchTarget | null {
  const repository = input.findRepository(input.payloadProjectPath);
  if (!repository) {
    return null;
  }

  if (input.gatedMrNumber === null || input.payloadMrNumber !== input.gatedMrNumber) {
    return null;
  }

  return {
    projectPath: repository.projectPath,
    mrNumber: input.gatedMrNumber,
  };
}

interface PinLogger {
  warn(obj: object, message: string): void;
}

export interface ResolvePinnedThreadsInput extends ResolvePinnedThreadFetchTargetInput {
  fetchThreads: (projectPath: string, mergeRequestNumber: number) => ReviewContextThread[];
  logger: PinLogger;
}

/**
 * Fetches the MR thread inventory through the AC9 provenance pin. The forgeable payload
 * is never used to drive fetchThreads directly: when the (projectPath, mrNumber) pair
 * cannot be pinned to a server-validated source, the action surface is empty (fail-closed,
 * no fetch). Shared by the review and followup processors so both close the same hole.
 */
export function resolvePinnedThreads(input: ResolvePinnedThreadsInput): ReviewContextThread[] {
  const pinnedTarget = resolvePinnedThreadFetchTarget(input);
  if (!pinnedTarget) {
    input.logger.warn(
      { projectPath: input.payloadProjectPath, mrNumber: input.payloadMrNumber },
      'Thread-fetch target failed provenance pin; action surface is empty',
    );
    return [];
  }

  return input.fetchThreads(pinnedTarget.projectPath, pinnedTarget.mrNumber);
}
