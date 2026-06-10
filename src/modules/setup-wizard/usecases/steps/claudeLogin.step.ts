import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import {
  skipped,
  succeeded,
  blocked,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';

export class ClaudeLoginStep implements SetupStep {
  readonly id = 'claude-login' as const;
  readonly title = 'Authentification Claude';

  async detect(context: WizardContext): Promise<StepOutcome | null> {
    const loggedIn = await context.gateways.claudeAuth.isLoggedIn();
    if (loggedIn) {
      return skipped('Déjà authentifié');
    }
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    if (context.flags.yes) {
      return blocked(
        "Mode non-interactif: connectez-vous d'abord avec claude /login",
        "Lancez 'claude /login' manuellement puis relancez le wizard",
      );
    }
    const result = await context.gateways.claudeAuth.triggerLogin();
    if (!result.success) {
      return blocked(
        "L'authentification Claude a échoué",
        "Relancez 'claude /login' puis le wizard une fois connecté",
      );
    }
    return succeeded('Authentification Claude réussie');
  }
}
