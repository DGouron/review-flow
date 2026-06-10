import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { dirname } from 'node:path';

import type {
  SetupStateGateway,
  SetupStateLoadResult,
} from '@/modules/setup-wizard/entities/setupState/setupState.gateway.js';
import { setupStateGuard } from '@/modules/setup-wizard/entities/setupState/setupState.guard.js';
import type { SetupState } from '@/modules/setup-wizard/entities/setupState/setupState.schema.js';

interface SetupStateFileSystemGatewayDependencies {
  filePath: string;
}

export class SetupStateFileSystemGateway implements SetupStateGateway {
  constructor(private readonly deps: SetupStateFileSystemGatewayDependencies) {}

  load(): SetupStateLoadResult {
    if (!existsSync(this.deps.filePath)) {
      return { state: null, corrupted: false };
    }
    let raw: string;
    try {
      raw = readFileSync(this.deps.filePath, 'utf-8');
    } catch {
      return { state: null, corrupted: true };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { state: null, corrupted: true };
    }
    const result = setupStateGuard.safeParse(parsed);
    if (!result.success) {
      return { state: null, corrupted: true };
    }
    return { state: result.data, corrupted: false };
  }

  save(state: SetupState): void {
    const dir = dirname(this.deps.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${this.deps.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tempPath, this.deps.filePath);
  }

  reset(): void {
    if (existsSync(this.deps.filePath)) {
      unlinkSync(this.deps.filePath);
    }
  }
}
