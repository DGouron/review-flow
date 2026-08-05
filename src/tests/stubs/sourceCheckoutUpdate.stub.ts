import type { SourceCheckoutUpdateGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.js';

export interface SourceCheckoutUpdateStubConfig {
  currentBranch: string;
  hasUncommittedChanges: boolean;
  toolPaths: Record<'git' | 'yarn', string | null>;
  fetchResult: { success: boolean; error: string | null };
  rebuildResult: { success: boolean; error: string | null };
}

const DEFAULT_CONFIG: SourceCheckoutUpdateStubConfig = {
  currentBranch: 'master',
  hasUncommittedChanges: false,
  toolPaths: { git: '/usr/bin/git', yarn: '/usr/bin/yarn' },
  fetchResult: { success: true, error: null },
  rebuildResult: { success: true, error: null },
};

export class StubSourceCheckoutUpdate implements SourceCheckoutUpdateGateway {
  private readonly config: SourceCheckoutUpdateStubConfig;
  calls: string[] = [];

  constructor(overrides: Partial<SourceCheckoutUpdateStubConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...overrides };
  }

  async getCurrentBranch(): Promise<string> {
    this.calls.push('getCurrentBranch');
    return this.config.currentBranch;
  }

  async hasUncommittedChanges(): Promise<boolean> {
    this.calls.push('hasUncommittedChanges');
    return this.config.hasUncommittedChanges;
  }

  async resolveToolPath(tool: 'git' | 'yarn'): Promise<string | null> {
    this.calls.push(`resolveToolPath:${tool}`);
    return this.config.toolPaths[tool];
  }

  async fetchLatest(): Promise<{ success: boolean; error: string | null }> {
    this.calls.push('fetchLatest');
    return this.config.fetchResult;
  }

  async rebuild(): Promise<{ success: boolean; error: string | null }> {
    this.calls.push('rebuild');
    return this.config.rebuildResult;
  }
}
