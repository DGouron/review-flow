import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EmberMemoryFileSystemGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberMemory.fileSystem.gateway.js';
import { EmberMemoryTurnFactory } from '@/tests/factories/emberMemory.factory.js';

const PROJECT_A = '/projects/alpha';
const PROJECT_B = '/projects/beta';

describe('EmberMemoryFileSystemGateway', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'reviewflow-ember-memory-'));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('returns null when no memory exists yet for a project', async () => {
    const gateway = new EmberMemoryFileSystemGateway({ homeDir });

    expect(await gateway.load(PROJECT_A)).toBeNull();
  });

  it('persists an appended turn and reads it back', async () => {
    const gateway = new EmberMemoryFileSystemGateway({ homeDir });
    const turn = EmberMemoryTurnFactory.create({ question: 'Statut ?', answer: 'Tout va bien.' });

    await gateway.appendTurn(PROJECT_A, turn);
    const loaded = await gateway.load(PROJECT_A);

    expect(loaded?.turns).toEqual([turn]);
  });

  it('reloads persisted turns from a fresh instance over the same home (survives a restart)', async () => {
    const writer = new EmberMemoryFileSystemGateway({ homeDir });
    const turn = EmberMemoryTurnFactory.create();
    await writer.appendTurn(PROJECT_A, turn);

    const reader = new EmberMemoryFileSystemGateway({ homeDir });
    const loaded = await reader.load(PROJECT_A);

    expect(loaded?.turns).toEqual([turn]);
  });

  it('keeps one project memory isolated from another', async () => {
    const gateway = new EmberMemoryFileSystemGateway({ homeDir });
    const turnA = EmberMemoryTurnFactory.create({ question: 'A ?', answer: 'constat sur A' });
    const turnB = EmberMemoryTurnFactory.create({ question: 'B ?', answer: 'constat sur B' });

    await gateway.appendTurn(PROJECT_A, turnA);
    await gateway.appendTurn(PROJECT_B, turnB);

    expect((await gateway.load(PROJECT_A))?.turns).toEqual([turnA]);
    expect((await gateway.load(PROJECT_B))?.turns).toEqual([turnB]);
  });

  it('appends in order, preserving earlier turns', async () => {
    const gateway = new EmberMemoryFileSystemGateway({ homeDir });
    const first = EmberMemoryTurnFactory.create({ question: 'Q1', answer: 'A1' });
    const second = EmberMemoryTurnFactory.create({ question: 'Q2', answer: 'A2' });

    await gateway.appendTurn(PROJECT_A, first);
    await gateway.appendTurn(PROJECT_A, second);

    expect((await gateway.load(PROJECT_A))?.turns).toEqual([first, second]);
  });

  it('returns null without throwing when the notebook is corrupted', async () => {
    const gateway = new EmberMemoryFileSystemGateway({ homeDir });
    await gateway.appendTurn(PROJECT_A, EmberMemoryTurnFactory.create());
    const notebook = join(
      homeDir,
      '.claude-review',
      'ember-memory',
      readdirSync(join(homeDir, '.claude-review', 'ember-memory'))[0],
    );
    writeFileSync(notebook, 'not valid json at all {{{', 'utf-8');

    await expect(gateway.load(PROJECT_A)).resolves.toBeNull();
  });

  it('clears a project memory so a later load returns null', async () => {
    const gateway = new EmberMemoryFileSystemGateway({ homeDir });
    await gateway.appendTurn(PROJECT_A, EmberMemoryTurnFactory.create());

    await gateway.clear(PROJECT_A);

    expect(await gateway.load(PROJECT_A)).toBeNull();
  });

  it('persists a recorded recurring insight and reads it back from a fresh instance', async () => {
    const writer = new EmberMemoryFileSystemGateway({ homeDir });
    await writer.appendInsight(PROJECT_A, 'Le projet alpha régresse chaque vendredi.');

    const reader = new EmberMemoryFileSystemGateway({ homeDir });
    const loaded = await reader.load(PROJECT_A);

    expect(loaded?.insights).toEqual(['Le projet alpha régresse chaque vendredi.']);
  });

  it('keeps recorded insights when a later turn is appended', async () => {
    const gateway = new EmberMemoryFileSystemGateway({ homeDir });
    await gateway.appendInsight(PROJECT_A, 'Régression du vendredi.');
    await gateway.appendTurn(PROJECT_A, EmberMemoryTurnFactory.create());

    const loaded = await gateway.load(PROJECT_A);

    expect(loaded?.insights).toEqual(['Régression du vendredi.']);
    expect(loaded?.turns).toHaveLength(1);
  });
});
