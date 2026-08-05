import { describe, it, expect } from 'vitest';

import { runSourceCheckoutSelfUpdate } from '@/modules/cli-configuration/usecases/version/runSourceCheckoutSelfUpdate.usecase.js';
import { StubSourceCheckoutUpdate } from '@/tests/stubs/sourceCheckoutUpdate.stub.js';

describe('runSourceCheckoutSelfUpdate usecase', () => {
  it('should fetch, rebuild and return started when every precondition is met', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate();

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({ status: 'started' });
    expect(sourceCheckoutUpdateGateway.calls).toEqual([
      'getCurrentBranch',
      'hasUncommittedChanges',
      'resolveToolPath:git',
      'resolveToolPath:yarn',
      'fetchLatest',
      'rebuild',
    ]);
  });

  it('should still rebuild and restart when fetching brings no new commit', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      fetchResult: { success: true, error: null },
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({ status: 'started' });
  });

  it('should refuse with wrong-branch when the checkout is not on master', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      currentBranch: 'feat/223-source-checkout-self-update',
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({ status: 'refused', motive: { kind: 'wrong-branch' } });
    expect(sourceCheckoutUpdateGateway.calls).toEqual(['getCurrentBranch']);
  });

  it('should refuse with dirty-checkout when there are uncommitted local changes', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      hasUncommittedChanges: true,
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({ status: 'refused', motive: { kind: 'dirty-checkout' } });
    expect(sourceCheckoutUpdateGateway.calls).toEqual([
      'getCurrentBranch',
      'hasUncommittedChanges',
    ]);
  });

  it('should refuse naming git as the missing tool when git cannot be resolved', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      toolPaths: { git: null, yarn: '/usr/bin/yarn' },
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({ status: 'refused', motive: { kind: 'missing-tool', tool: 'git' } });
    expect(sourceCheckoutUpdateGateway.calls).toEqual([
      'getCurrentBranch',
      'hasUncommittedChanges',
      'resolveToolPath:git',
    ]);
  });

  it('should refuse naming yarn as the missing tool when yarn cannot be resolved', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      toolPaths: { git: '/usr/bin/git', yarn: null },
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({ status: 'refused', motive: { kind: 'missing-tool', tool: 'yarn' } });
    expect(sourceCheckoutUpdateGateway.calls).toEqual([
      'getCurrentBranch',
      'hasUncommittedChanges',
      'resolveToolPath:git',
      'resolveToolPath:yarn',
    ]);
  });

  it('should refuse with fetch-failed and the reported detail on a fetch conflict', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      fetchResult: { success: false, error: 'CONFLICT (content): Merge conflict in src/index.ts' },
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({
      status: 'refused',
      motive: {
        kind: 'fetch-failed',
        detail: 'CONFLICT (content): Merge conflict in src/index.ts',
      },
    });
    expect(sourceCheckoutUpdateGateway.calls).not.toContain('rebuild');
  });

  it('should refuse with fetch-failed and the reported detail when no remote branch is configured', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      fetchResult: {
        success: false,
        error: 'There is no tracking information for the current branch',
      },
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({
      status: 'refused',
      motive: {
        kind: 'fetch-failed',
        detail: 'There is no tracking information for the current branch',
      },
    });
  });

  it('should use a default detail when the fetch fails without a reported error', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      fetchResult: { success: false, error: null },
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({
      status: 'refused',
      motive: { kind: 'fetch-failed', detail: 'Unknown error' },
    });
  });

  it('should refuse with rebuild-failed and never restart when the rebuild fails', async () => {
    const sourceCheckoutUpdateGateway = new StubSourceCheckoutUpdate({
      rebuildResult: { success: false, error: 'error TS2322: Type mismatch' },
    });

    const result = await runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway });

    expect(result).toEqual({ status: 'refused', motive: { kind: 'rebuild-failed' } });
    expect(sourceCheckoutUpdateGateway.calls).toEqual([
      'getCurrentBranch',
      'hasUncommittedChanges',
      'resolveToolPath:git',
      'resolveToolPath:yarn',
      'fetchLatest',
      'rebuild',
    ]);
  });
});
