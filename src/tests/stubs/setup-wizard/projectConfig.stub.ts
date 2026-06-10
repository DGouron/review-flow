import type {
  ProjectConfigGateway,
  ProjectConfigContents,
} from '@/modules/setup-wizard/entities/projectConfig/projectConfig.gateway.js';

export class StubProjectConfigGateway implements ProjectConfigGateway {
  private readonly store = new Map<string, ProjectConfigContents>();
  public backupCallCount = 0;
  public writeCallCount = 0;
  public failNextWrite = false;

  exists(projectPath: string): boolean {
    return this.store.has(projectPath);
  }

  read(projectPath: string): ProjectConfigContents | null {
    return this.store.get(projectPath) ?? null;
  }

  write(projectPath: string, config: ProjectConfigContents): void {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('EACCES: permission denied');
    }
    this.writeCallCount++;
    this.store.set(projectPath, { ...config });
  }

  backup(projectPath: string): string | null {
    if (!this.store.has(projectPath)) return null;
    this.backupCallCount++;
    return `${projectPath}/.claude/reviews/config.json.bak`;
  }

  seedExisting(projectPath: string): void {
    this.store.set(projectPath, { preset: 'backend', language: 'en', agents: ['architecture'] });
  }
}
