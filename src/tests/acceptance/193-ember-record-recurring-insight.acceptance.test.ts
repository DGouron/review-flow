import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { EmberMemoryGateway } from '@/modules/ember-chat/entities/emberMemory/emberMemory.gateway.js';
import type { EmberRecurringInsight } from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';
import { createRecordInsightHandler } from '@/modules/ember-chat/interface-adapters/controllers/mcp/recordInsight.handler.js';
import { EmberMemoryFileSystemGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberMemory.fileSystem.gateway.js';

const PROJECT_A = '/projects/alpha';
const PROJECT_B = '/projects/beta';
const INSIGHT = 'Le projet X régresse chaque vendredi.';

/**
 * SDD outer loop for SPEC-193. Drives the recording path end-to-end through the
 * MCP handler against a real EmberMemoryFileSystemGateway over a temp home:
 * record an insight then load it back exactly once (nominal + dedup); a blank is
 * never recorded; project A's insight is absent from project B; a failing write
 * does not throw and the handler still reports success.
 *
 * NOT covered headlessly: the transport-gateway MCP wiring (plan FLAG 2) that
 * attaches the stdio MCP server and exposes mcp__review-progress__record_insight
 * to the `--bg` run. That file is declared HUMBLE GLUE and needs a MANUAL browser
 * run end-to-end as the final check.
 */
describe('Let Ember record a recurring insight it derives (acceptance, SPEC-193)', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'reviewflow-ember-record-'));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  describe('Ember can record a recurring finding it derived, reused without recomputation', () => {
    it('record nominal: a recorded insight is loaded back exactly once', async () => {
      const memory = new EmberMemoryFileSystemGateway({ homeDir });
      const record = createRecordInsightHandler({ memory });

      const result = record({ projectPath: PROJECT_A, insight: INSIGHT });
      await flush();

      expect(result.isError ?? false).toBe(false);
      const loaded = await memory.load(PROJECT_A);
      expect(loaded?.insights).toEqual([INSIGHT]);
    });
  });

  describe('The same insight is never recorded twice', () => {
    it('duplicate: recording the same finding twice keeps a single entry', async () => {
      const memory = new EmberMemoryFileSystemGateway({ homeDir });
      const record = createRecordInsightHandler({ memory });

      record({ projectPath: PROJECT_A, insight: INSIGHT });
      await flush();
      record({ projectPath: PROJECT_A, insight: INSIGHT });
      await flush();

      const loaded = await memory.load(PROJECT_A);
      expect(loaded?.insights).toEqual([INSIGHT]);
    });
  });

  describe('An empty or blank insight is never recorded', () => {
    it('empty insight: a blank insight leaves the notebook empty', async () => {
      const memory = new EmberMemoryFileSystemGateway({ homeDir });
      const record = createRecordInsightHandler({ memory });

      const result = record({ projectPath: PROJECT_A, insight: '' });
      await flush();

      expect(result.isError ?? false).toBe(false);
      expect(await memory.load(PROJECT_A)).toBeNull();
    });
  });

  describe('A recorded insight never crosses into another project memory', () => {
    it('per-project isolation: an insight recorded for project A is absent from project B', async () => {
      const memory = new EmberMemoryFileSystemGateway({ homeDir });
      const record = createRecordInsightHandler({ memory });

      record({ projectPath: PROJECT_A, insight: INSIGHT });
      await flush();

      expect(await memory.load(PROJECT_B)).toBeNull();
    });
  });

  describe('Recording is best-effort: a failing write does not break the answer', () => {
    it('record failure non-fatal: a rejecting write still returns success without throwing', async () => {
      const memory = new RejectingMemoryGateway();
      const record = createRecordInsightHandler({ memory });

      const result = record({ projectPath: PROJECT_A, insight: INSIGHT });
      await flush();

      expect(result.isError ?? false).toBe(false);
    });
  });
});

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class RejectingMemoryGateway implements EmberMemoryGateway {
  async load(): Promise<null> {
    return null;
  }

  async appendTurn(): Promise<void> {
    return Promise.resolve();
  }

  async appendInsight(_projectPath: string, _insight: EmberRecurringInsight): Promise<void> {
    throw new Error('write failed');
  }

  async clear(): Promise<void> {
    return Promise.resolve();
  }
}
