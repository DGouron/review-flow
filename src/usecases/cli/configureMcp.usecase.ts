import { hasServerEntry, safeParseMcpSettings } from '@/entities/mcpSettings/mcpSettings.guard.js';

export type ConfigureMcpResult = 'configured' | 'already-configured' | 'claude-not-found' | 'validation-failed' | 'failed';

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

    const parseResult = safeParseMcpSettings(settings);
    const mcpServers = parseResult.success
      ? parseResult.data.mcpServers
      : {};
    const existingArgs = mcpServers['review-progress']?.args;

    if (existingArgs?.[0] === mcpServerPath) {
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

    try {
      const written = this.deps.readFileSync(this.deps.settingsPath, 'utf-8');
      if (!hasServerEntry(JSON.parse(written), 'review-progress')) {
        return 'validation-failed';
      }
    } catch {
      return 'validation-failed';
    }

    return 'configured';
  }
}
