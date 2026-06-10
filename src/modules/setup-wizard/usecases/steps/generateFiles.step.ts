import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import {
  skipped,
  succeeded,
  blocked,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { getAgentsForPreset } from '@/modules/setup-wizard/services/agentPresetCatalog.js';

export class GenerateFilesStep implements SetupStep {
  readonly id = 'generate-files' as const;
  readonly title = 'Génération des fichiers projet';

  async detect(context: WizardContext): Promise<StepOutcome | null> {
    const path = context.project.localPath;
    if (!path) return null;
    const previousRunSucceeded = context.state?.steps?.['generate-files']?.status === 'succeeded';
    if (previousRunSucceeded && context.gateways.projectConfig.exists(path)) {
      return skipped('Fichiers projet déjà générés (run précédent)');
    }
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    const path = context.project.localPath;
    if (!path) {
      return blocked('Chemin projet manquant', "Spécifiez 'reviewflow setup /chemin'");
    }
    const preset = context.project.preset ?? 'backend';
    const language = context.project.language ?? 'en';
    const agents = getAgentsForPreset(preset);

    const projectConfig = context.gateways.projectConfig;
    const alreadyExists = projectConfig.exists(path);

    if (alreadyExists && !context.flags.force) {
      return blocked(
        'Configuration projet existante',
        'Utilisez --force pour écraser (sauvegarde dans config.json.bak)',
      );
    }

    let backupPath: string | null = null;
    if (alreadyExists && context.flags.force) {
      backupPath = projectConfig.backup(path);
    }

    try {
      projectConfig.write(path, { preset, language, agents });
      context.gateways.skillTemplate.writeSkill(path, 'review-code', language);
      context.gateways.skillTemplate.writeSkill(path, 'review-followup', language);
      context.gateways.skillTemplate.writeMcpJson(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('EACCES')) {
        return blocked(
          "Impossible d'écrire dans le dossier projet, vérifiez les permissions",
          'Modifiez les permissions du dossier ou choisissez un autre emplacement',
        );
      }
      return blocked(`Échec d'écriture: ${message}`, 'Vérifiez les permissions du dossier');
    }

    if (backupPath) {
      return succeeded(`Fichiers projet régénérés (sauvegarde: ${backupPath})`, {
        preset,
        language,
        agents,
        backupPath,
      });
    }
    return succeeded('Fichiers projet générés', { preset, language, agents });
  }
}
