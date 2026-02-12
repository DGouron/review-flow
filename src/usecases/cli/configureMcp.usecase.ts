export type ConfigureMcpResult = 'configured' | 'already-configured' | 'claude-not-found' | 'failed';

export interface ConfigureMcpDependencies {
  isClaudeInstalled: () => boolean;
  readFileSync: (path: string, encoding: string) => string;
  writeFileSync: (path: string, content: string) => void;
  existsSync: (path: string) => boolean;
  copyFileSync: (src: string, dest: string) => void;
  resolveMcpServerPath: () => string;
  settingsPath: string;
}

export class ConfigureMcpUseCase {
  constructor(private readonly deps: ConfigureMcpDependencies) {}

  execute(): ConfigureMcpResult {
    if (!this.deps.isClaudeInstalled()) {
      return 'claude-not-found';
    }

    const mcpServerPath = this.deps.resolveMcpServerPath();
    let settings: Record<string, unknown>;

    try {
      const content = this.deps.readFileSync(this.deps.settingsPath, 'utf-8');
      settings = JSON.parse(content);
    } catch {
      settings = {};
    }

    const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
    const existing = mcpServers['review-progress'] as
      | { command: string; args: string[] }
      | undefined;

    if (existing?.args?.[0] === mcpServerPath) {
      return 'already-configured';
    }

    if (this.deps.existsSync(this.deps.settingsPath)) {
      this.deps.copyFileSync(
        this.deps.settingsPath,
        `${this.deps.settingsPath}.bak`,
      );
    }

    mcpServers['review-progress'] = {
      command: 'node',
      args: [mcpServerPath],
    };
    settings.mcpServers = mcpServers;

    this.deps.writeFileSync(
      this.deps.settingsPath,
      JSON.stringify(settings, null, 2),
    );

    return 'configured';
  }
}
