import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { GitRemoteGateway } from '@/modules/setup-wizard/entities/gitRemote/gitRemote.gateway.js';
import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

type CommandExecutor = (command: string, options?: object) => Buffer | string;

interface GitRemoteCliGatewayDependencies {
  executeCommand?: CommandExecutor;
  existsSyncImpl?: (path: string) => boolean;
}

export class GitRemoteCliGateway implements GitRemoteGateway {
  private readonly executor: CommandExecutor;
  private readonly existsSyncImpl: (path: string) => boolean;

  constructor(deps: GitRemoteCliGatewayDependencies = {}) {
    this.executor = deps.executeCommand ?? execSync;
    this.existsSyncImpl = deps.existsSyncImpl ?? existsSync;
  }

  isRepo(path: string): boolean {
    return this.existsSyncImpl(join(path, '.git'));
  }

  getOriginRemote(path: string): string | null {
    try {
      const output = this.executor('git remote get-url origin', { cwd: path, stdio: 'pipe' });
      const value = output.toString().trim();
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }

  detectPlatform(remoteUrl: string): Platform {
    const lowered = remoteUrl.toLowerCase();
    if (lowered.includes('github.com')) return 'github';
    if (lowered.includes('gitlab.com') || lowered.includes('gitlab.')) return 'gitlab';
    return 'unknown';
  }
}
