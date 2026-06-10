import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import { succeeded, blocked } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';

export class AddProjectStep implements SetupStep {
  readonly id = 'add-project' as const;
  readonly title = 'Ajout du projet';

  async detect(_context: WizardContext): Promise<StepOutcome | null> {
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    let path = context.project.localPath;
    if (!path) {
      if (context.flags.yes) {
        return blocked(
          'Aucun chemin projet fourni',
          "Relancez avec 'reviewflow setup /chemin/projet'",
        );
      }
      path = await context.gateways.prompt.askText(
        'Chemin du projet à ajouter (cwd par défaut) ?',
        process.cwd(),
      );
    }

    if (!context.gateways.gitRemote.isRepo(path)) {
      return blocked(
        "Le dossier n'est pas un dépôt git",
        "Initialisez 'git init' puis ajoutez un remote",
      );
    }
    const remoteUrl = context.gateways.gitRemote.getOriginRemote(path);
    if (!remoteUrl) {
      return blocked(
        "Aucun remote git configuré, ajoutez 'origin' avant de continuer",
        'git remote add origin <url>',
      );
    }

    let platform: Platform = context.gateways.gitRemote.detectPlatform(remoteUrl);
    if (platform === 'unknown') {
      if (context.flags.ai) {
        const fallbackAvailability = context.gateways.aiFallback.isAvailable();
        if (!fallbackAvailability.available) {
          context.emitter.emitWarning(
            `--ai demandé mais l'agent de fallback n'est pas encore disponible : ${fallbackAvailability.reason ?? 'inconnu'}`,
          );
        }
      }
      if (context.flags.yes) {
        return blocked(
          'Plateforme inconnue en mode non-interactif',
          'Relancez sans -y ou ajoutez un remote github/gitlab connu',
        );
      }
      const choice = await context.gateways.prompt.askChoice(
        'Plateforme inconnue, choisissez github ou gitlab',
        [
          { label: 'GitHub', value: 'github' },
          { label: 'GitLab', value: 'gitlab' },
        ],
      );
      if (choice !== 'github' && choice !== 'gitlab') {
        return blocked('Plateforme invalide', 'Sélectionnez github ou gitlab');
      }
      platform = choice;
    }

    context.project.localPath = path;
    context.project.platform = platform;
    context.project.remoteUrl = remoteUrl;

    return succeeded(`Projet ${platform} détecté: ${remoteUrl}`, { platform, remoteUrl });
  }
}
