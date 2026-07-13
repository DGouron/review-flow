import { existsSync, readFileSync } from 'node:fs';

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

  // `projectPath` is part of the ValidationGateway contract but unused here: this
  // gateway validates the global CLI config (server/user/queue), never the
  // per-project `.claude/reviews/config.json` (github/gitlab/reviewSkill schema).
  // Swapping in the project file used to make this check fail for every
  // already-configured project, since that file never has a server/user/queue section.
  validate(_projectPath: string): ValidationReport {
    const useCase = new ValidateConfigUseCase({ existsSync, readFileSync });
    const result = useCase.execute({
      configPath: this.deps.configPath,
      envPath: this.deps.envPath,
    });
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
