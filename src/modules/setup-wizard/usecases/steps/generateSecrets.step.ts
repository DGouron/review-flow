import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import {
  skipped,
  succeeded,
  blocked,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { generateWebhookSecret, isValidSecret } from '@/shared/services/secretGenerator.js';

export class GenerateSecretsStep implements SetupStep {
  readonly id = 'secrets' as const;
  readonly title = 'Génération des secrets webhook';

  async detect(context: WizardContext): Promise<StepOutcome | null> {
    if (!context.project.localPath) return null;
    const contents = context.gateways.envFile.read(context.project.localPath);
    if (
      contents.gitlabSecret &&
      contents.githubSecret &&
      isValidSecret(contents.gitlabSecret) &&
      isValidSecret(contents.githubSecret)
    ) {
      return skipped('Secrets webhook déjà présents et valides');
    }
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    if (!context.project.localPath) {
      return blocked(
        'Chemin projet manquant',
        "Spécifiez un chemin avec 'reviewflow setup /chemin'",
      );
    }
    const existing = context.gateways.envFile.read(context.project.localPath);
    const hasPlaceholders =
      (existing.gitlabSecret && !isValidSecret(existing.gitlabSecret)) ||
      (existing.githubSecret && !isValidSecret(existing.githubSecret));

    if (hasPlaceholders && !context.flags.yes) {
      const confirm = await context.gateways.prompt.askConfirm(
        'Des secrets placeholders détectés, regénérer ?',
        true,
      );
      if (!confirm) {
        return blocked(
          'Secrets placeholders inchangés',
          'Confirmez la regénération ou éditez .env manuellement',
        );
      }
    }

    const gitlabSecret = generateWebhookSecret();
    const githubSecret = generateWebhookSecret();
    context.gateways.envFile.write(context.project.localPath, { gitlabSecret, githubSecret });
    context.gateways.envFile.ensureGitignored(context.project.localPath);

    return succeeded('Secrets webhook générés et écrits dans .env', { gitlabSecret, githubSecret });
  }
}
