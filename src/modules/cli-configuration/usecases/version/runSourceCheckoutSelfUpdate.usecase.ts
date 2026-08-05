import type { SelfUpdateResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js';
import type { SourceCheckoutUpdateGateway } from '@/modules/cli-configuration/entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.js';

const DEFAULT_BRANCH = 'master';

export interface RunSourceCheckoutSelfUpdateDependencies {
  sourceCheckoutUpdateGateway: SourceCheckoutUpdateGateway;
}

async function findMissingTool(
  sourceCheckoutUpdateGateway: SourceCheckoutUpdateGateway,
): Promise<'git' | 'yarn' | null> {
  const gitPath = await sourceCheckoutUpdateGateway.resolveToolPath('git');
  if (gitPath === null) {
    return 'git';
  }

  const yarnPath = await sourceCheckoutUpdateGateway.resolveToolPath('yarn');
  if (yarnPath === null) {
    return 'yarn';
  }

  return null;
}

export async function runSourceCheckoutSelfUpdate(
  dependencies: RunSourceCheckoutSelfUpdateDependencies,
): Promise<SelfUpdateResult> {
  const { sourceCheckoutUpdateGateway } = dependencies;

  const currentBranch = await sourceCheckoutUpdateGateway.getCurrentBranch();
  if (currentBranch !== DEFAULT_BRANCH) {
    return { status: 'refused', motive: { kind: 'wrong-branch' } };
  }

  const hasUncommittedChanges = await sourceCheckoutUpdateGateway.hasUncommittedChanges();
  if (hasUncommittedChanges) {
    return { status: 'refused', motive: { kind: 'dirty-checkout' } };
  }

  const missingTool = await findMissingTool(sourceCheckoutUpdateGateway);
  if (missingTool !== null) {
    return { status: 'refused', motive: { kind: 'missing-tool', tool: missingTool } };
  }

  const fetchResult = await sourceCheckoutUpdateGateway.fetchLatest();
  if (!fetchResult.success) {
    return {
      status: 'refused',
      motive: { kind: 'fetch-failed', detail: fetchResult.error ?? 'Unknown error' },
    };
  }

  const rebuildResult = await sourceCheckoutUpdateGateway.rebuild();
  if (!rebuildResult.success) {
    return { status: 'refused', motive: { kind: 'rebuild-failed' } };
  }

  return { status: 'started' };
}
