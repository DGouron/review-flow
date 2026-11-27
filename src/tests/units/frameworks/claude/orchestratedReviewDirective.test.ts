import { describe, expect, it } from 'vitest';

import {
  buildOrchestratedReviewDirective,
  resolveReviewflowCliPath,
  shellCommandOf,
} from '@/frameworks/claude/orchestratedReviewDirective.js';

const directive = buildOrchestratedReviewDirective({
  jobId: 'github:acme/app:2111',
  clerkSessionName: 'Revue #2111 · greffe',
  cliCommand: "'/usr/local/bin/node' '/opt/reviewflow/dist/main/cli.js'",
  reviewTimeoutMinutes: 45,
  roleTimeoutMinutes: 15,
});

describe('buildOrchestratedReviewDirective', () => {
  it('gives the clerk the job id and its own session name', () => {
    expect(directive).toContain('**Job ID**: `github:acme/app:2111`');
    expect(directive).toContain('**Your session name**: `Revue #2111 · greffe`');
  });

  it('gives the launch command with the absolute CLI path and the job, leaving role and brief to add', () => {
    expect(directive).toContain(
      "**Launch command**: `'/usr/local/bin/node' '/opt/reviewflow/dist/main/cli.js' session launch --job github:acme/app:2111`",
    );
    expect(directive).toContain('`--role lot:<id> --brief <absolute path of the brief>`');
  });

  it('gives the await command, bounded under the ten minutes of one Bash call', () => {
    expect(directive).toContain(
      "**Await command**: `'/usr/local/bin/node' '/opt/reviewflow/dist/main/cli.js' session await --job github:acme/app:2111 --max-wait 540`",
    );
    expect(directive).toContain('`DONE|FAILED|TIMEOUT <role> <session id>`');
  });

  it('states the timeouts the clerk works within', () => {
    expect(directive).toContain('15 minutes after its launch');
    expect(directive).toContain('45 minutes');
  });
});

describe('shellCommandOf', () => {
  it('quotes each path so a space or a quote cannot split the command', () => {
    expect(shellCommandOf(['/Applications/My Node/node', "/home/o'brien/cli.js"])).toBe(
      "'/Applications/My Node/node' '/home/o'\\''brien/cli.js'",
    );
  });
});

describe('resolveReviewflowCliPath', () => {
  it('finds the CLI next to the running build', () => {
    const path = resolveReviewflowCliPath({
      moduleDirectory: '/opt/reviewflow/dist/frameworks/claude',
      workingDirectory: '/srv',
      fileExists: (candidate) => candidate === '/opt/reviewflow/dist/main/cli.js',
    });

    expect(path).toBe('/opt/reviewflow/dist/main/cli.js');
  });

  it('falls back to the build of the working directory when run from the sources', () => {
    const path = resolveReviewflowCliPath({
      moduleDirectory: '/home/dev/review-flow/src/frameworks/claude',
      workingDirectory: '/home/dev/review-flow',
      fileExists: (candidate) => candidate === '/home/dev/review-flow/dist/main/cli.js',
    });

    expect(path).toBe('/home/dev/review-flow/dist/main/cli.js');
  });

  it('fails with a hint to build when no CLI can be found', () => {
    expect(() =>
      resolveReviewflowCliPath({
        moduleDirectory: '/a/src/frameworks/claude',
        workingDirectory: '/a',
        fileExists: () => false,
      }),
    ).toThrow(/yarn build/);
  });
});
