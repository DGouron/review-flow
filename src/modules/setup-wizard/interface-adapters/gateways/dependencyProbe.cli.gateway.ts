import { execSync } from 'node:child_process';

import type {
  DependencyProbeGateway,
  DependencyProbeReport,
  DependencyProbeResult,
} from '@/modules/setup-wizard/entities/dependencyProbe/dependencyProbe.gateway.js';

type CommandExecutor = (command: string, options?: object) => Buffer | string;

interface DependencyProbeCliGatewayDependencies {
  executeCommand?: CommandExecutor;
  getNodeVersion?: () => string;
}

function probeBinary(executor: CommandExecutor, command: string): DependencyProbeResult {
  try {
    const output = executor(command, { stdio: 'pipe' });
    const text = output.toString().trim();
    const match = text.match(/(\d+(?:\.\d+)*)/);
    return { present: true, version: match ? match[1] : null };
  } catch {
    return { present: false, version: null };
  }
}

export class DependencyProbeCliGateway implements DependencyProbeGateway {
  private readonly executor: CommandExecutor;
  private readonly getNodeVersion: () => string;

  constructor(deps: DependencyProbeCliGatewayDependencies = {}) {
    this.executor = deps.executeCommand ?? execSync;
    this.getNodeVersion = deps.getNodeVersion ?? (() => process.versions.node);
  }

  probeAll(): DependencyProbeReport {
    return {
      node: { present: true, version: this.getNodeVersion() },
      yarn: probeBinary(this.executor, 'yarn --version'),
      claude: probeBinary(this.executor, 'claude --version'),
      git: probeBinary(this.executor, 'git --version'),
      gh: probeBinary(this.executor, 'gh --version'),
      glab: probeBinary(this.executor, 'glab --version'),
    };
  }
}
