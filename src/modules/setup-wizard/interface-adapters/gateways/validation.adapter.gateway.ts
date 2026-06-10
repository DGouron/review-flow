import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ValidateConfigUseCase } from '@/modules/cli-configuration/usecases/cli/validateConfig.usecase.js';
import type {
  ValidationGateway,
  ValidationReport,
} from '@/modules/setup-wizard/entities/validation/validation.gateway.js';

interface ValidationAdapterGatewayDependencies {
  configPath: string;
  envPath: string;
}

export class ValidationAdapterGateway implements ValidationGateway {
  constructor(private readonly deps: ValidationAdapterGatewayDependencies) {}

  validate(projectPath: string): ValidationReport {
    const useCase = new ValidateConfigUseCase({ existsSync, readFileSync });
    const projectConfigPath = join(projectPath, '.claude', 'reviews', 'config.json');
    const cliConfigPath = existsSync(projectConfigPath) ? projectConfigPath : this.deps.configPath;
    const result = useCase.execute({ configPath: cliConfigPath, envPath: this.deps.envPath });
    return {
      status: result.status,
      issues: result.issues.map((issue) => ({
        field: issue.field,
        message: issue.message,
        severity: issue.severity,
      })),
    };
  }
}
