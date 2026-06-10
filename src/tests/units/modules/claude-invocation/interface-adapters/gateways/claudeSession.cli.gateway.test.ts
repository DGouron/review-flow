import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import {
  ClaudeSessionCliGateway,
  type ClaudeProcessRunner,
  type ClaudeProcessRunResult,
} from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { computeCostUsd } from '@/modules/token-accounting/entities/modelPricing/modelPricing.js';

const FIXTURE_ROOT = fileURLToPath(new URL('../../../../../fixtures/claudeCli/', import.meta.url));

function noopRunner(): ClaudeProcessRunner {
  return async () => ({ stdout: '', stderr: '', exitCode: 0 });
}

function createRunner(scripted: ClaudeProcessRunResult[]): {
  runner: ClaudeProcessRunner;
  calls: Array<{ args: string[]; localPath: string | null }>;
} {
  const calls: Array<{ args: string[]; localPath: string | null }> = [];
  let index = 0;
  const runner: ClaudeProcessRunner = async ({ args, cwd }) => {
    calls.push({ args, localPath: cwd ?? null });
    const next = scripted[index] ?? { stdout: '', stderr: '', exitCode: 0 };
    index += 1;
    return next;
  };
  return { runner, calls };
}

const baseDispatchInput = {
  prompt: '/review-front 42',
  flags: {
    model: 'claude-opus-4-7',
    mcpConfigJson: '{"x":1}',
    systemPrompt: 'system',
    allowedTools: 'Read,Bash',
    disallowedTools: 'EnterPlanMode',
    permissionMode: 'auto' as const,
  },
  localPath: '/tmp/project',
  jobId: 'gitlab:owner/repo:42',
  jobType: 'review' as const,
};

describe('ClaudeSessionCliGateway.dispatch', () => {
  it('extracts the session id from claude --bg stdout (new "backgrounded · <id>" format)', async () => {
    const { runner, calls } = createRunner([
      {
        stdout:
          'backgrounded · 7c5dcf5d\n  claude agents             list sessions\n  claude attach 7c5dcf5d    open in this terminal',
        stderr: '',
        exitCode: 0,
      },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('dispatched');
    if (result.status === 'dispatched') {
      expect(result.sessionId).toBe('7c5dcf5d');
    }
    expect(calls[0]?.args).toContain('--bg');
    expect(calls[0]?.args).not.toContain('-p');
    expect(calls[0]?.args).not.toContain('--print');
    // --permission-mode auto is used; --dangerously-skip-permissions
    // must NOT be added because it is an alias for bypassPermissions,
    // which contradicts auto and triggers the disclaimer requirement.
    expect(calls[0]?.args).not.toContain('--dangerously-skip-permissions');
  });

  it('returns "rate-limited" when stderr matches a rate-limit pattern', async () => {
    const { runner } = createRunner([
      { stdout: '', stderr: 'HTTP 429 Too Many Requests', exitCode: 1 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('rate-limited');
  });

  it('returns "rate-limited" when stdout contains a rate-limit hint even with exit code 0', async () => {
    const { runner } = createRunner([
      { stdout: 'rate limit reached, please retry later', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('rate-limited');
  });

  it('returns "failed" when the process exits non-zero without a rate-limit hint', async () => {
    const { runner } = createRunner([{ stdout: '', stderr: 'boom', exitCode: 2 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.rawStderr).toBe('boom');
    }
  });

  it('returns "failed" when stdout has no parseable session id', async () => {
    const { runner } = createRunner([{ stdout: 'no session here', stderr: '', exitCode: 0 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('failed');
  });

  it('does not capture a hex sequence appearing outside the "backgrounded · <id>" prefix', async () => {
    const { runner } = createRunner([
      {
        stdout: 'Error: failed to start (code abc12345)\nLogs at /tmp/deadbeef.log',
        stderr: '',
        exitCode: 0,
      },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('failed');
  });

  it('captures session id only from the dedicated "backgrounded · <id>" line', async () => {
    const { runner } = createRunner([
      {
        stdout:
          'Spawning daemon abc123\nbackgrounded · 7c5dcf5d\n  claude attach 7c5dcf5d    open in this terminal',
        stderr: '',
        exitCode: 0,
      },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.dispatch(baseDispatchInput);

    expect(result.status).toBe('dispatched');
    if (result.status === 'dispatched') {
      expect(result.sessionId).toBe('7c5dcf5d');
    }
  });
});

describe('ClaudeSessionCliGateway.stop and remove', () => {
  it('returns success when stop exits zero', async () => {
    const { runner, calls } = createRunner([{ stdout: 'stopped', stderr: '', exitCode: 0 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.stop('abc123' as never);

    expect(result.success).toBe(true);
    expect(calls[0]?.args).toEqual(['stop', 'abc123']);
  });

  it('returns success false with warning when stop exits non-zero', async () => {
    const { runner } = createRunner([{ stdout: '', stderr: 'unknown session', exitCode: 1 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const result = await gateway.stop('abc123' as never);

    expect(result.success).toBe(false);
    expect(result.warning).toContain('unknown session');
  });

  it('runs claude rm for remove', async () => {
    const { runner, calls } = createRunner([{ stdout: 'removed', stderr: '', exitCode: 0 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    await gateway.remove('abc123' as never);

    expect(calls[0]?.args).toEqual(['rm', 'abc123']);
  });
});

describe('ClaudeSessionCliGateway.listAgents', () => {
  it('parses the agents JSON array', async () => {
    const json = JSON.stringify([
      { id: 'abc', status: 'completed' },
      { id: 'def', status: 'running' },
    ]);
    const { runner } = createRunner([{ stdout: json, stderr: '', exitCode: 0 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const entries = await gateway.listAgents();

    expect(entries).toHaveLength(2);
    expect(entries[0]?.status).toBe('completed');
  });

  it('returns an empty array on unparseable JSON', async () => {
    const { runner } = createRunner([{ stdout: 'not json', stderr: '', exitCode: 0 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const entries = await gateway.listAgents();

    expect(entries).toEqual([]);
  });
});

describe('ClaudeSessionCliGateway.daemonStatus and usage', () => {
  it('reports unreachable when daemon status exits non-zero', async () => {
    const { runner } = createRunner([{ stdout: '', stderr: 'connection refused', exitCode: 1 }]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const status = await gateway.daemonStatus();

    expect(status.reachable).toBe(false);
  });

  it('reports usesApiPool true when usage output mentions API tokens', async () => {
    const { runner } = createRunner([
      { stdout: 'Subscription plan: Pro\nAPI tokens used: 12345', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const usage = await gateway.usage();

    expect(usage.usesApiPool).toBe(true);
  });

  it('reports usesApiPool false when usage output is purely subscription-based', async () => {
    const { runner } = createRunner([
      { stdout: 'Subscription plan: Pro', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const usage = await gateway.usage();

    expect(usage.usesApiPool).toBe(false);
  });

  it('reports usesApiPool false when the usage command fails (unknown CLI surface)', async () => {
    const { runner } = createRunner([
      { stdout: '', stderr: "error: unknown command 'usage'", exitCode: 1 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    const usage = await gateway.usage();

    expect(usage.usesApiPool).toBe(false);
    expect(usage.raw).toContain("unknown command 'usage'");
  });

  it('does not invoke "/usage" as a positional CLI argument', async () => {
    const { runner, calls } = createRunner([
      { stdout: 'Subscription plan: Pro', stderr: '', exitCode: 0 },
    ]);
    const gateway = new ClaudeSessionCliGateway(runner);

    await gateway.usage();

    expect(calls[0]?.args).not.toContain('/usage');
  });
});

describe('ClaudeSessionCliGateway.getSessionUsage', () => {
  it('aggregates assistant tokens, picks the last model, and computes costUsd from the pinned fixture', async () => {
    const gateway = new ClaudeSessionCliGateway(noopRunner(), { homeDir: FIXTURE_ROOT });

    const snapshot = await gateway.getSessionUsage(
      parseSessionId('abc12345'),
      '/tmp/project-fixture',
    );

    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    expect(snapshot.model).toBe('claude-opus-4-7');
    expect(snapshot.usage.inputTokens).toBe(3000);
    expect(snapshot.usage.outputTokens).toBe(550);
    expect(snapshot.usage.cacheCreationInputTokens).toBe(50);
    expect(snapshot.usage.cacheReadInputTokens).toBe(2000);
    expect(snapshot.usage.costUsd).toBe(
      computeCostUsd('claude-opus-4-7', {
        inputTokens: 3000,
        outputTokens: 550,
        cacheCreationInputTokens: 50,
        cacheReadInputTokens: 2000,
        costUsd: 0,
      }),
    );
  });

  it('returns null when the JSONL file is missing', async () => {
    const gateway = new ClaudeSessionCliGateway(noopRunner(), { homeDir: FIXTURE_ROOT });

    const snapshot = await gateway.getSessionUsage(
      parseSessionId('missing0'),
      '/tmp/project-fixture',
    );

    expect(snapshot).toBeNull();
  });

  it('returns null when the entire file is empty', async () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'rf-session-usage-'));
    const sessionDir = join(tempHome, '.claude', 'projects', '-tmp-empty');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'empty001.jsonl'), '');

    try {
      const gateway = new ClaudeSessionCliGateway(noopRunner(), { homeDir: tempHome });
      const snapshot = await gateway.getSessionUsage(parseSessionId('empty001'), '/tmp/empty');
      expect(snapshot).toBeNull();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('returns null when every line is malformed JSON', async () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'rf-session-usage-'));
    const sessionDir = join(tempHome, '.claude', 'projects', '-tmp-bad');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, 'bad00001.jsonl'),
      'not-json\n{also not json\n{"missing":"closing"\n',
    );

    try {
      const gateway = new ClaudeSessionCliGateway(noopRunner(), { homeDir: tempHome });
      const snapshot = await gateway.getSessionUsage(parseSessionId('bad00001'), '/tmp/bad');
      expect(snapshot).toBeNull();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('ignores non-assistant lines (user, system, tool_use)', async () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'rf-session-usage-'));
    const sessionDir = join(tempHome, '.claude', 'projects', '-tmp-mixed');
    mkdirSync(sessionDir, { recursive: true });
    const lines = [
      JSON.stringify({ type: 'user', message: { content: 'hi' } }),
      JSON.stringify({ type: 'system', message: { content: 'sysinfo' } }),
      JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-5',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      }),
      JSON.stringify({ type: 'tool_use', payload: {} }),
    ];
    writeFileSync(join(sessionDir, 'mix00001.jsonl'), `${lines.join('\n')}\n`);

    try {
      const gateway = new ClaudeSessionCliGateway(noopRunner(), { homeDir: tempHome });
      const snapshot = await gateway.getSessionUsage(parseSessionId('mix00001'), '/tmp/mixed');
      expect(snapshot).not.toBeNull();
      if (snapshot === null) return;
      expect(snapshot.model).toBe('claude-sonnet-4-5');
      expect(snapshot.usage.inputTokens).toBe(10);
      expect(snapshot.usage.outputTokens).toBe(20);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('returns null when assistant lines exist but none carry a parseable usage object', async () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'rf-session-usage-'));
    const sessionDir = join(tempHome, '.claude', 'projects', '-tmp-no-usage');
    mkdirSync(sessionDir, { recursive: true });
    const lines = [
      JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-7' } }),
      JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-4-7', usage: null } }),
    ];
    writeFileSync(join(sessionDir, 'nou00001.jsonl'), `${lines.join('\n')}\n`);

    try {
      const gateway = new ClaudeSessionCliGateway(noopRunner(), { homeDir: tempHome });
      const snapshot = await gateway.getSessionUsage(parseSessionId('nou00001'), '/tmp/no-usage');
      expect(snapshot).toBeNull();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
