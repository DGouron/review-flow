import { execFileSync } from 'node:child_process';

import { describe, it, expect } from 'vitest';

import { GitHubReviewLabelCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.github.cli.gateway.js';
import { GitLabReviewLabelCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.gitlab.cli.gateway.js';

const LABEL = 'review-in-progress';

function capturingGateway(): { gateway: GitHubReviewLabelCliGateway; captured: () => string } {
  let command = '';
  const gateway = new GitHubReviewLabelCliGateway((issued: string): string => {
    command = issued;
    return '';
  });
  return { gateway, captured: () => command };
}

function capturingGitLabGateway(): {
  gateway: GitLabReviewLabelCliGateway;
  captured: () => string;
} {
  let command = '';
  const gateway = new GitLabReviewLabelCliGateway((issued: string): string => {
    command = issued;
    return '';
  });
  return { gateway, captured: () => command };
}

function parsesAsValidShell(command: string): boolean {
  try {
    execFileSync('/bin/sh', ['-n', '-c', command]);
    return true;
  } catch {
    return false;
  }
}

describe('GitHubReviewLabelCliGateway', () => {
  it('creates the label with --force so an existing label is updated instead of rejected', async () => {
    const { gateway, captured } = capturingGateway();

    await gateway.ensureLabelExists({ projectPath: 'owner/repo', label: LABEL });

    expect(captured()).toBe(`gh label create '${LABEL}' --force -R 'owner/repo'`);
  });

  it('adds the label through the issue labels endpoint', async () => {
    const { gateway, captured } = capturingGateway();

    await gateway.addLabel({ projectPath: 'owner/repo', mrNumber: 7, label: LABEL });

    expect(captured()).toBe(
      `gh api --method POST 'repos/owner/repo/issues/7/labels' --field 'labels[]=${LABEL}'`,
    );
  });

  it('removes the label through the issue label endpoint', async () => {
    const { gateway, captured } = capturingGateway();

    await gateway.removeLabel({ projectPath: 'owner/repo', mrNumber: 7, label: LABEL });

    expect(captured()).toBe(`gh api --method DELETE 'repos/owner/repo/issues/7/labels/${LABEL}'`);
  });

  it('quotes the labels[] token so the shell does not read it as a glob character class', async () => {
    const { gateway, captured } = capturingGateway();

    await gateway.addLabel({ projectPath: 'owner/repo', mrNumber: 7, label: LABEL });

    expect(captured()).toContain(`'labels[]=${LABEL}'`);
    expect(parsesAsValidShell(captured())).toBe(true);
  });

  it('stays shell-valid for a label containing a single quote', async () => {
    const { gateway, captured } = capturingGateway();

    await gateway.addLabel({ projectPath: 'owner/repo', mrNumber: 7, label: "it's $(whoami)" });

    expect(parsesAsValidShell(captured())).toBe(true);
  });

  it('resolves when creating the label fails', async () => {
    const gateway = new GitHubReviewLabelCliGateway(() => {
      throw new Error('label create refused');
    });

    await expect(
      gateway.ensureLabelExists({ projectPath: 'owner/repo', label: LABEL }),
    ).resolves.toBeUndefined();
  });

  it('rejects when adding the label fails, leaving best-effort to the use case', async () => {
    const gateway = new GitHubReviewLabelCliGateway(() => {
      throw new Error('missing scope');
    });

    await expect(
      gateway.addLabel({ projectPath: 'owner/repo', mrNumber: 7, label: LABEL }),
    ).rejects.toThrow('missing scope');
  });

  it('rejects when removing the label fails', async () => {
    const gateway = new GitHubReviewLabelCliGateway(() => {
      throw new Error('missing scope');
    });

    await expect(
      gateway.removeLabel({ projectPath: 'owner/repo', mrNumber: 7, label: LABEL }),
    ).rejects.toThrow('missing scope');
  });
});

describe('GitLabReviewLabelCliGateway', () => {
  it('creates the label on the url-encoded project with an explicit colour', async () => {
    const { gateway, captured } = capturingGitLabGateway();

    await gateway.ensureLabelExists({ projectPath: 'group/sub/project', label: LABEL });

    expect(captured()).toBe(
      `glab api --method POST 'projects/group%2Fsub%2Fproject/labels' --field 'name=${LABEL}' --field 'color=#1f77b4'`,
    );
  });

  it('adds the label through the merge-request update endpoint', async () => {
    const { gateway, captured } = capturingGitLabGateway();

    await gateway.addLabel({ projectPath: 'group/project', mrNumber: 42, label: LABEL });

    expect(captured()).toBe(
      `glab api --method PUT 'projects/group%2Fproject/merge_requests/42' --field 'add_labels=${LABEL}'`,
    );
  });

  it('removes the label through the merge-request update endpoint', async () => {
    const { gateway, captured } = capturingGitLabGateway();

    await gateway.removeLabel({ projectPath: 'group/project', mrNumber: 42, label: LABEL });

    expect(captured()).toBe(
      `glab api --method PUT 'projects/group%2Fproject/merge_requests/42' --field 'remove_labels=${LABEL}'`,
    );
  });

  it('stays shell-valid for a label containing a single quote', async () => {
    const { gateway, captured } = capturingGitLabGateway();

    await gateway.addLabel({ projectPath: 'group/project', mrNumber: 42, label: "it's $(whoami)" });

    expect(parsesAsValidShell(captured())).toBe(true);
  });

  it('resolves when the label already exists and the create call fails', async () => {
    const gateway = new GitLabReviewLabelCliGateway(() => {
      throw new Error('409 Label already exists');
    });

    await expect(
      gateway.ensureLabelExists({ projectPath: 'group/project', label: LABEL }),
    ).resolves.toBeUndefined();
  });

  it('rejects when adding the label fails, leaving best-effort to the use case', async () => {
    const gateway = new GitLabReviewLabelCliGateway(() => {
      throw new Error('403 forbidden');
    });

    await expect(
      gateway.addLabel({ projectPath: 'group/project', mrNumber: 42, label: LABEL }),
    ).rejects.toThrow('403 forbidden');
  });

  it('rejects when removing the label fails', async () => {
    const gateway = new GitLabReviewLabelCliGateway(() => {
      throw new Error('403 forbidden');
    });

    await expect(
      gateway.removeLabel({ projectPath: 'group/project', mrNumber: 42, label: LABEL }),
    ).rejects.toThrow('403 forbidden');
  });
});
