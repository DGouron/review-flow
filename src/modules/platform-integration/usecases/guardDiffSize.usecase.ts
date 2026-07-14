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
    `Petite pause avant la revue : cette merge request compte ${countedLines} lignes ` +
    `(budget ${budget}), un peu trop pour une revue de qualité en une seule fois. ` +
    'Découpée en plus petits morceaux, elle sera revue plus vite, plus finement, ' +
    'et bien plus simple à corriger si besoin. Une piste pour la découper : ' +
    '1) séparez les refactorings des nouvelles fonctionnalités, ' +
    '2) extrayez les changements indépendants dans des MR dédiées, ' +
    '3) limitez chaque MR à une seule intention. ' +
    'Merci pour le travail, hâte de la relire découpée !'
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
