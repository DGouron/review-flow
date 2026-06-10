import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import {
  skipped,
  succeeded,
  blocked,
  warning,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';

const DAEMON_WAIT_TIMEOUT_MS = 30000;

export class DaemonInstallStep implements SetupStep {
  readonly id = 'daemon' as const;
  readonly title = 'Installation du daemon ReviewFlow';

  async detect(context: WizardContext): Promise<StepOutcome | null> {
    const status = await context.gateways.daemonService.status();
    if (status.status === 'active') {
      return skipped('Daemon déjà actif');
    }
    if (status.status === 'unsupported-platform') {
      return warning(
        `Plateforme ${status.platform} non supportée, lancez 'yarn start' manuellement`,
      );
    }
    return null;
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    if (context.flags.yes === false) {
      const confirm = await context.gateways.prompt.askConfirm(
        'Installer le daemon systemd reviewflow-app ?',
        true,
      );
      if (!confirm) {
        return warning("Installation du daemon ignorée, lancez 'yarn start' manuellement");
      }
    }
    const install = await context.gateways.daemonService.install();
    if (!install.success) {
      const sudoHint = install.requiresSudo ? "Exécutez 'sudo -v' puis relancez" : '';
      return blocked(
        install.error ?? "Échec de l'installation du daemon",
        sudoHint || 'Consultez les logs systemd et relancez',
      );
    }
    const healthy = await context.gateways.daemonService.waitUntilHealthy(DAEMON_WAIT_TIMEOUT_MS);
    if (!healthy) {
      return blocked(
        'Le daemon a démarré mais ne répond pas',
        "Vérifiez 'systemctl status reviewflow-app'",
      );
    }
    return succeeded('Daemon installé et actif');
  }
}
