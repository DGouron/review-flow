import type { SetupStep } from '@/modules/setup-wizard/entities/setupStep/setupStep.js';
import {
  succeeded,
  blocked,
  warning,
} from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.js';
import type { StepOutcome } from '@/modules/setup-wizard/entities/stepOutcome/stepOutcome.schema.js';
import type { WizardContext } from '@/modules/setup-wizard/entities/wizardContext/wizardContext.js';

const MINIMUM_NODE_MAJOR = 20;

function parseMajor(version: string | null): number | null {
  if (version === null) return null;
  const match = version.match(/(\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

export class CheckDependenciesStep implements SetupStep {
  readonly id = 'dependencies' as const;
  readonly title = 'Vérification des dépendances';

  async detect(context: WizardContext): Promise<StepOutcome | null> {
    const report = context.gateways.dependencyProbe.probeAll();
    const nodeMajor = parseMajor(report.node.version);

    if (!report.node.present || nodeMajor === null) {
      return blocked(
        'Node.js manquant',
        'Installez Node.js 20 ou supérieur depuis https://nodejs.org',
      );
    }
    if (nodeMajor < MINIMUM_NODE_MAJOR) {
      return blocked(
        `Node.js ${MINIMUM_NODE_MAJOR} minimum requis, version détectée ${report.node.version}`,
        `Mettez à jour Node.js vers la version ${MINIMUM_NODE_MAJOR} ou supérieure`,
      );
    }
    if (!report.claude.present) {
      return blocked(
        'Claude CLI manquant',
        'Installez Claude CLI: https://docs.anthropic.com/en/docs/claude-code/overview',
      );
    }
    if (!report.git.present) {
      return blocked('Git manquant', 'Installez git via votre gestionnaire de paquets');
    }
    if (!report.yarn.present) {
      return blocked('Yarn manquant', "Installez Yarn: 'npm install -g yarn'");
    }
    if (!report.gh.present && !report.glab.present) {
      return warning(
        'Aucun CLI plateforme installé, vous devrez en installer au moins un selon votre repo',
      );
    }
    return succeeded('Toutes les dépendances sont présentes', {
      node: report.node.version,
      claude: report.claude.version,
      gh: report.gh.present,
      glab: report.glab.present,
    });
  }

  async execute(context: WizardContext): Promise<StepOutcome> {
    const result = await this.detect(context);
    return result ?? blocked('Détection impossible', 'Relancez le wizard');
  }
}
