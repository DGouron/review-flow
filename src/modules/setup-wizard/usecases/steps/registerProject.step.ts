import { basename } from 'node:path';

import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import {
  skipped,
  succeeded,
  blocked,
  warning,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';

const DAEMON_PROBE_TIMEOUT_MS = 5000;
const DEFAULT_DAEMON_PORT = 3847;

export class RegisterProjectStep implements SetupStep {
  readonly id = 'register-project' as const;
  readonly title = 'Enregistrement du projet';

  async detect(context: WizardContext): Promise<StepOutcome | null> {
    if (!context.project.localPath) return null;
    if (context.gateways.serverConfig.hasProject(context.project.localPath)) {
      return skipped('Déjà enregistré côté serveur');
    }
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    const path = context.project.localPath;
    if (!path) {
      return blocked('Chemin projet manquant', 'Relancez avec un chemin valide');
    }

    context.gateways.serverConfig.addProject({
      name: basename(path),
      localPath: path,
      enabled: true,
    });

    const ping = await context.gateways.daemonHealthProbe.ping(
      DEFAULT_DAEMON_PORT,
      DAEMON_PROBE_TIMEOUT_MS,
    );
    if (!ping.healthy) {
      return warning('Daemon injoignable, le projet sera enregistré au prochain lancement');
    }
    return succeeded('Projet enregistré côté daemon');
  }
}
