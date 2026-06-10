import type {
  DependencyProbeGateway,
  DependencyProbeReport,
  DependencyProbeResult,
} from '@/modules/setup-wizard/entities/dependencyProbe/dependencyProbe.gateway.js';

interface StubOptions {
  node?: DependencyProbeResult;
  yarn?: DependencyProbeResult;
  claude?: DependencyProbeResult;
  git?: DependencyProbeResult;
  gh?: DependencyProbeResult;
  glab?: DependencyProbeResult;
}

const presentDefault: DependencyProbeResult = { present: true, version: '20.10.0' };

export class StubDependencyProbeGateway implements DependencyProbeGateway {
  private readonly report: DependencyProbeReport;

  constructor(options: StubOptions = {}) {
    this.report = {
      node: options.node ?? presentDefault,
      yarn: options.yarn ?? presentDefault,
      claude: options.claude ?? presentDefault,
      git: options.git ?? presentDefault,
      gh: options.gh ?? presentDefault,
      glab: options.glab ?? presentDefault,
    };
  }

  probeAll(): DependencyProbeReport {
    return this.report;
  }
}
