import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BudgetGateway } from '@/modules/token-accounting/entities/budget/budget.gateway.js';
import { budgetConfigGuard } from '@/modules/token-accounting/entities/budget/budgetConfig.guard.js';
import type { BudgetConfig } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';
import { getConfigDir } from '@/shared/services/configDir.js';

const BUDGET_FILE_NAME = 'budget.json';

export class FilesystemBudgetGateway implements BudgetGateway {
  private getFilePath(): string {
    return join(getConfigDir(), BUDGET_FILE_NAME);
  }

  async load(): Promise<BudgetConfig | null> {
    const filePath = this.getFilePath();
    if (!existsSync(filePath)) {
      return null;
    }

    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const result = budgetConfigGuard.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data;
  }

  async save(config: BudgetConfig): Promise<void> {
    const dir = getConfigDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const filePath = join(dir, BUDGET_FILE_NAME);
    writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
  }
}
