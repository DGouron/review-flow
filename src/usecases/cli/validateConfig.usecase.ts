export interface ValidateConfigDependencies {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: string) => string;
}

export interface ValidateConfigInput {
  configPath: string;
  envPath: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidateConfigResult {
  status: 'valid' | 'invalid' | 'not-found';
  issues: ValidationIssue[];
}

export class ValidateConfigUseCase {
  constructor(private readonly deps: ValidateConfigDependencies) {}

  execute(input: ValidateConfigInput): ValidateConfigResult {
    const issues: ValidationIssue[] = [];

    if (!this.deps.existsSync(input.configPath)) {
      return { status: 'not-found', issues: [] };
    }

    let config: Record<string, unknown>;
    try {
      const raw = this.deps.readFileSync(input.configPath, 'utf-8');
      config = JSON.parse(raw);
    } catch {
      issues.push({
        field: 'config.json',
        message: 'Invalid JSON format',
        severity: 'error',
      });
      return { status: 'invalid', issues };
    }

    this.validateServer(config, issues);
    this.validateUser(config, issues);
    this.validateQueue(config, issues);
    this.validateRepositories(config, issues);
    this.validateEnv(input.envPath, issues);

    return {
      status: issues.length > 0 ? 'invalid' : 'valid',
      issues,
    };
  }

  private validateServer(config: Record<string, unknown>, issues: ValidationIssue[]): void {
    const server = config.server as Record<string, unknown> | undefined;
    if (!server) {
      issues.push({ field: 'server', message: 'Missing server section', severity: 'error' });
      return;
    }
    if (typeof server.port !== 'number' || server.port < 1 || server.port > 65535) {
      issues.push({ field: 'server.port', message: 'Port must be between 1 and 65535', severity: 'error' });
    }
  }

  private validateUser(config: Record<string, unknown>, issues: ValidationIssue[]): void {
    if (!config.user || typeof config.user !== 'object') {
      issues.push({ field: 'user', message: 'Missing user section', severity: 'error' });
    }
  }

  private validateQueue(config: Record<string, unknown>, issues: ValidationIssue[]): void {
    if (!config.queue || typeof config.queue !== 'object') {
      issues.push({ field: 'queue', message: 'Missing queue section', severity: 'error' });
    }
  }

  private validateRepositories(config: Record<string, unknown>, issues: ValidationIssue[]): void {
    if (!Array.isArray(config.repositories)) return;

    for (const repo of config.repositories) {
      const entry = repo as Record<string, unknown>;
      if (typeof entry.localPath === 'string' && !this.deps.existsSync(entry.localPath)) {
        issues.push({
          field: 'repositories',
          message: `Path does not exist: ${entry.localPath}`,
          severity: 'error',
        });
      }
    }
  }

  private validateEnv(envPath: string, issues: ValidationIssue[]): void {
    if (!this.deps.existsSync(envPath)) {
      issues.push({ field: '.env', message: 'Missing .env file', severity: 'error' });
    }
  }
}
