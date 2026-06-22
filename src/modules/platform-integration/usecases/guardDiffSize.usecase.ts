import type { ChangedFilesFetchGateway } from '@/modules/shared-kernel/entities/diffSizeGate/changedFilesFetch.gateway.js';
import { evaluateDiffSizeGate } from '@/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

interface GuardDiffSizeInput {
  projectIdentifier: string;
  mergeRequestNumber: number;
  budget: number;
}

export type GuardDiffSizeVerdict =
  | { kind: 'allowed' }
  | { kind: 'blocked'; countedLines: number; budget: number; message: string };

interface GuardDiffSizeDependencies {
  changedFilesFetchGateway: ChangedFilesFetchGateway;
}

function buildSplitMessage(countedLines: number, budget: number): string {
  return (
    `Revue refusée : cette merge request fait ${countedLines} lignes comptées ` +
    `(budget ${budget}). Pour faciliter la revue, découpez-la : ` +
    '1) séparez les refactorings des nouvelles fonctionnalités, ' +
    '2) extrayez les changements indépendants dans des MR dédiées, ' +
    '3) limitez chaque MR à une seule intention.'
  );
}

export class GuardDiffSizeUseCase implements UseCase<GuardDiffSizeInput, GuardDiffSizeVerdict> {
  constructor(private readonly dependencies: GuardDiffSizeDependencies) {}

  execute(input: GuardDiffSizeInput): GuardDiffSizeVerdict {
    const files = this.fetchChangedFiles(input);
    if (files === null) {
      return { kind: 'allowed' };
    }

    const { oversized, countedLines, budget } = evaluateDiffSizeGate({
      files,
      budget: input.budget,
    });

    if (!oversized) {
      return { kind: 'allowed' };
    }

    return {
      kind: 'blocked',
      countedLines,
      budget,
      message: buildSplitMessage(countedLines, budget),
    };
  }

  private fetchChangedFiles(input: GuardDiffSizeInput) {
    try {
      return this.dependencies.changedFilesFetchGateway.fetchChangedFiles(
        input.projectIdentifier,
        input.mergeRequestNumber,
      );
    } catch {
      return null;
    }
  }
}
