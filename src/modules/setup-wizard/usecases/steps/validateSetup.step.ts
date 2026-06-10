import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import {
  succeeded,
  blocked,
  warning,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';

export class ValidateSetupStep implements SetupStep {
  readonly id = 'validate' as const;
  readonly title = 'Validation finale';

  async detect(_context: WizardContext): Promise<StepOutcome | null> {
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    const path = context.project.localPath;
    if (!path) {
      return blocked('Chemin projet manquant', 'Relancez avec un chemin valide');
    }
    const report = context.gateways.validation.validate(path);
    if (report.status === 'not-found') {
      return blocked(
        'Configuration introuvable',
        "Relancez 'reviewflow setup /chemin' pour générer la configuration",
      );
    }
    if (report.status === 'invalid') {
      const errors = report.issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        const summary = errors.map((issue) => `${issue.field}: ${issue.message}`).join('; ');
        return blocked(
          `Le setup a des erreurs bloquantes: ${summary}`,
          "Lancez 'reviewflow validate' pour le détail",
        );
      }
      const warningCount = report.issues.length;
      return warning(`Setup terminé avec ${warningCount} warning(s), voir 'reviewflow validate'`);
    }
    return succeeded('Configuration valide');
  }
}
