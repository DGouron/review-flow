import { execFileSync } from 'node:child_process';

import { describe, it, expect } from 'vitest';

import { GitHubNoteCommentPostCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.github.cli.gateway.js';
import { GitLabNoteCommentPostCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.gitlab.cli.gateway.js';

// A real review report: markdown with backticks wrapping code that contains
// parentheses, plus $() and quotes. Inside a double-quoted shell string these
// trigger command substitution and break the shell — the regression we fix.
const DANGEROUS_BODY =
  '## Review (MG-2416)\n`isJobboardOffer(offerWithApplications)` and $(whoami) and it\'s "quoted" \\x';

function parsesAsValidShell(command: string): boolean {
  try {
    // sh -n parses without executing: a syntax error throws.
    execFileSync('/bin/sh', ['-n', '-c', command]);
    return true;
  } catch {
    return false;
  }
}

describe('CLI note-comment post gateways — shell safety (issue #276)', () => {
  it('GitLab: builds a shell-valid command for a body with backticks/parens/$()/quotes', async () => {
    let captured = '';
    const gateway = new GitLabNoteCommentPostCliGateway((command: string): string => {
      captured = command;
      return '';
    });

    await gateway.postComment({ projectPath: 'group/project', mrNumber: 42, body: DANGEROUS_BODY });

    expect(parsesAsValidShell(captured)).toBe(true);
  });

  it('GitHub: builds a shell-valid command for a body with backticks/parens/$()/quotes', async () => {
    let captured = '';
    const gateway = new GitHubNoteCommentPostCliGateway((command: string): string => {
      captured = command;
      return '';
    });

    await gateway.postComment({ projectPath: 'owner/repo', mrNumber: 7, body: DANGEROUS_BODY });

    expect(parsesAsValidShell(captured)).toBe(true);
  });
});
