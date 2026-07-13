import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import {
  skipped,
  succeeded,
  blocked,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import { getAgentsForPreset } from '@/modules/setup-wizard/services/agentPresetCatalog.js';

const DEFAULT_MODEL = 'sonnet';
const REVIEW_SKILL = 'review-code';
const REVIEW_FOLLOWUP_SKILL = 'review-followup';

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
    // Prefer the selection ConfigurePipelineStep resolved (honors a custom
    // pick); fall back to the preset default when resuming a run where that
    // step's context was not carried over.
    const agents = context.project.agents ?? getAgentsForPreset(preset);
    const platform = context.project.platform;

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
      projectConfig.write(path, {
        github: platform === 'github',
        gitlab: platform === 'gitlab',
        defaultModel: DEFAULT_MODEL,
        reviewSkill: REVIEW_SKILL,
        reviewFollowupSkill: REVIEW_FOLLOWUP_SKILL,
        language,
        ...(agents.length > 0 ? { agents } : {}),
      });
      context.gateways.skillTemplate.writeSkill(path, REVIEW_SKILL, language);
      context.gateways.skillTemplate.writeSkill(path, REVIEW_FOLLOWUP_SKILL, language);
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

    const agentNames = agents.map((agent) => agent.name);
    if (backupPath) {
      return succeeded(`Fichiers projet régénérés (sauvegarde: ${backupPath})`, {
        preset,
        language,
        agents: agentNames,
        backupPath,
      });
    }
    return succeeded('Fichiers projet générés', { preset, language, agents: agentNames });
  }
}
