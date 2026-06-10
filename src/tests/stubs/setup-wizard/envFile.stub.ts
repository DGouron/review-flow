import type {
  EnvFileGateway,
  EnvFileContents,
} from '@/modules/setup-wizard/entities/envFile/envFile.gateway.js';

export class StubEnvFileGateway implements EnvFileGateway {
  private readonly fileStore = new Map<string, EnvFileContents>();
  private readonly gitignoredPaths = new Set<string>();
  public writeCallCount = 0;
  public ensureGitignoredCallCount = 0;

  read(projectPath: string): EnvFileContents {
    return this.fileStore.get(projectPath) ?? { gitlabSecret: null, githubSecret: null };
  }

  write(projectPath: string, contents: EnvFileContents): void {
    this.writeCallCount++;
    this.fileStore.set(projectPath, { ...contents });
  }

  ensureGitignored(projectPath: string): void {
    this.ensureGitignoredCallCount++;
    this.gitignoredPaths.add(projectPath);
  }

  seedSecrets(
    projectPath: string,
    gitlabSecret = 'a'.repeat(64),
    githubSecret = 'b'.repeat(64),
  ): void {
    this.fileStore.set(projectPath, { gitlabSecret, githubSecret });
  }

  snapshot(projectPath: string): string {
    const entry = this.fileStore.get(projectPath);
    if (!entry) return '';
    return JSON.stringify(entry);
  }
}
