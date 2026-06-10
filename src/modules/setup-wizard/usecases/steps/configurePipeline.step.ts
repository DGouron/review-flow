import type {
  Preset,
  Language,
} from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import { succeeded, blocked } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';
import {
  getAgentsForPreset,
  getFullAgentCatalog,
} from '@/modules/setup-wizard/services/agentPresetCatalog.js';

function isPreset(value: string): value is Preset {
  return (
    value === 'backend' ||
    value === 'frontend' ||
    value === 'fullstack' ||
    value === 'basic' ||
    value === 'custom'
  );
}

function isLanguage(value: string): value is Language {
  return value === 'en' || value === 'fr';
}

export class ConfigurePipelineStep implements SetupStep {
  readonly id = 'pipeline' as const;
  readonly title = 'Configuration du pipeline de review';

  async detect(_context: WizardContext): Promise<StepOutcome | null> {
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    const presetChoice = context.flags.yes
      ? 'backend'
      : await context.gateways.prompt.askChoice('Choisissez un preset:', [
          { label: 'Backend (Node/Fastify/DDD)', value: 'backend' },
          { label: 'Frontend (React/Vue)', value: 'frontend' },
          { label: 'Fullstack', value: 'fullstack' },
          { label: 'Basic (single-pass review)', value: 'basic' },
          { label: 'Custom (multi-select agents)', value: 'custom' },
        ]);
    if (!isPreset(presetChoice)) {
      return blocked(
        'Preset invalide',
        'Choisissez parmi backend, frontend, fullstack, basic, custom',
      );
    }

    let agents = getAgentsForPreset(presetChoice);
    if (presetChoice === 'custom') {
      const catalog = getFullAgentCatalog();
      const selected = await context.gateways.prompt.askMultiSelect(
        'Sélectionnez les agents:',
        catalog.map((agent) => ({ label: agent, value: agent })),
      );
      if (selected.length === 0) {
        return blocked(
          "Sélectionnez au moins un agent ou choisissez le preset 'basic'",
          'Relancez et cochez un ou plusieurs agents',
        );
      }
      agents = selected;
    }

    const languageChoice = context.flags.yes
      ? 'en'
      : await context.gateways.prompt.askChoice('Langue des skills:', [
          { label: 'English (default)', value: 'en' },
          { label: 'Français', value: 'fr' },
        ]);
    const language = isLanguage(languageChoice) ? languageChoice : 'en';

    context.project.preset = presetChoice;
    context.project.language = language;

    return succeeded(`Pipeline configuré: ${presetChoice} / ${language}`, {
      preset: presetChoice,
      language,
      agents,
    });
  }
}
