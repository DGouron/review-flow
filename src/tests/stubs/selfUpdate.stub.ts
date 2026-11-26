import type {
  GlobalInstallOutcome,
  SelfUpdateCommandPort,
} from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js';

type StubSelfUpdateCommandOptions = {
  installOutcome?: GlobalInstallOutcome;
  installedVersionAfterInstall?: string | null;
};

export class StubSelfUpdateCommand implements SelfUpdateCommandPort {
  private readonly options: StubSelfUpdateCommandOptions;
  requestedVersion: string | null = null;

  constructor(options: StubSelfUpdateCommandOptions = {}) {
    this.options = options;
  }

  async installGlobalVersion(version: string): Promise<GlobalInstallOutcome> {
    this.requestedVersion = version;
    return this.options.installOutcome ?? { kind: 'installed' };
  }

  async readInstalledVersion(): Promise<string | null> {
    if ('installedVersionAfterInstall' in this.options) {
      return this.options.installedVersionAfterInstall ?? null;
    }
    return this.requestedVersion;
  }

  async restartDaemon(_serverPort?: number): Promise<void> {
    return;
  }
}
