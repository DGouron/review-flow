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
 * - projectPath MUST resolve to a configured repository.
 * - mrNumber MUST equal the merge-request that passed the upstream trusted-actor gate.
 * If either cannot be established, the action surface is empty (null, fail-closed).
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
