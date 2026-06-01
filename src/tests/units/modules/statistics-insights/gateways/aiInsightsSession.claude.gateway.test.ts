import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiInsightsSessionClaudeGateway } from '@/modules/statistics-insights/interface-adapters/gateways/aiInsightsSession.claude.gateway.js';
import { StubClaudeSessionGateway } from '@/tests/stubs/claudeSession.stub.js';

const FAST_OPTIONS = (homeDir: string) => ({
  homeDir,
  model: 'sonnet',
  pollIntervalMs: 1,
  maxAttempts: 20,
});

const PROJECT_PATH = '/home/dev/Documents/Projets/target-project';

function transcriptDir(homeDir: string, projectPath: string): string {
  const slug = projectPath.replace(/\//g, '-');
  const dir = join(homeDir, '.claude', 'projects', slug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('AiInsightsSessionClaudeGateway (integration with real filesystem)', () => {
  let homeDir: string;
  let sessionGateway: StubClaudeSessionGateway;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'insights-session-'));
    sessionGateway = new StubClaudeSessionGateway();
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('dispatches --bg in the target project, accumulates the transcript answer, and cleans up the session', async () => {
    const dir = transcriptDir(homeDir, PROJECT_PATH);
    const lines = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '{"part":' }] } }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '1}' }], stop_reason: 'end_turn' },
      }),
    ];
    writeFileSync(join(dir, 'stub-session-abc.jsonl'), lines.join('\n') + '\n');

    const gateway = new AiInsightsSessionClaudeGateway(sessionGateway, FAST_OPTIONS(homeDir));
    const result = await gateway.run('insights prompt', PROJECT_PATH);

    expect(result).toEqual({ status: 'completed', answer: '{"part":1}' });
    expect(sessionGateway.dispatchCalls[0].localPath).toBe(PROJECT_PATH);
    expect(sessionGateway.dispatchCalls[0].jobType).toBe('insights');
    expect(sessionGateway.dispatchCalls[0].flags.mcpConfigJson).toBe('{"mcpServers":{}}');
    expect(sessionGateway.stopCalls).toEqual(['stub-session']);
    expect(sessionGateway.removeCalls).toEqual(['stub-session']);
  });

  it('returns unavailable without cleanup when the dispatch fails', async () => {
    sessionGateway.setDispatchResult({ status: 'failed', rawStderr: 'not logged in' });

    const gateway = new AiInsightsSessionClaudeGateway(sessionGateway, FAST_OPTIONS(homeDir));
    const result = await gateway.run('insights prompt', PROJECT_PATH);

    expect(result).toEqual({ status: 'unavailable', reason: 'failed' });
    expect(sessionGateway.stopCalls).toEqual([]);
    expect(sessionGateway.removeCalls).toEqual([]);
  });

  it('times out and still cleans up when no transcript turn completes', async () => {
    const gateway = new AiInsightsSessionClaudeGateway(sessionGateway, FAST_OPTIONS(homeDir));
    const result = await gateway.run('insights prompt', PROJECT_PATH);

    expect(result).toEqual({ status: 'timed-out' });
    expect(sessionGateway.stopCalls).toEqual(['stub-session']);
    expect(sessionGateway.removeCalls).toEqual(['stub-session']);
  });
});
