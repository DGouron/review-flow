import type {
  ValidationGateway,
  ValidationReport,
} from '@/modules/setup-wizard/entities/validation/validation.gateway.js';

interface StubOptions {
  report?: ValidationReport;
}

export class StubValidationGateway implements ValidationGateway {
  private readonly report: ValidationReport;

  constructor(options: StubOptions = {}) {
    this.report = options.report ?? { status: 'valid', issues: [] };
  }

  validate(_projectPath: string): ValidationReport {
    return this.report;
  }
}
