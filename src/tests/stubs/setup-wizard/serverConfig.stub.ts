import type {
  ServerConfigGateway,
  ServerConfigEntry,
} from '@/modules/setup-wizard/entities/serverConfig/serverConfig.gateway.js';

interface StubOptions {
  daemonReachable?: boolean;
}

export class StubServerConfigGateway implements ServerConfigGateway {
  private readonly entries = new Map<string, ServerConfigEntry>();
  public addProjectCallCount = 0;
  public readonly daemonReachable: boolean;

  constructor(options: StubOptions = {}) {
    this.daemonReachable = options.daemonReachable ?? true;
  }

  hasProject(localPath: string): boolean {
    return this.entries.has(localPath);
  }

  addProject(entry: ServerConfigEntry): void {
    this.addProjectCallCount++;
    this.entries.set(entry.localPath, { ...entry });
  }

  seedProject(localPath: string, name = 'my-project'): void {
    this.entries.set(localPath, { name, localPath, enabled: true });
  }
}
