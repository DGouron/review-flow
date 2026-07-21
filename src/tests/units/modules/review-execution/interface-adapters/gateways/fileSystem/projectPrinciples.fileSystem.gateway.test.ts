import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ProjectPrinciplesFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/fileSystem/projectPrinciples.fileSystem.gateway.js';

describe('ProjectPrinciplesFileSystemGateway (integration with real filesystem)', () => {
  let projectPath: string;
  let gateway: ProjectPrinciplesFileSystemGateway;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'project-principles-'));
    gateway = new ProjectPrinciplesFileSystemGateway();
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('returns null CLAUDE.md and empty skill directory names when nothing exists', () => {
    const signals = gateway.readSignals(projectPath);

    expect(signals).toEqual({ claudeMd: null, skillDirectoryNames: [] });
  });

  it('reads the root CLAUDE.md content when present', () => {
    writeFileSync(join(projectPath, 'CLAUDE.md'), '# We apply SOLID');

    const signals = gateway.readSignals(projectPath);

    expect(signals.claudeMd).toContain('SOLID');
  });

  it('lists directory names under .claude/skills, ignoring files', () => {
    const skillsDir = join(projectPath, '.claude', 'skills');
    mkdirSync(join(skillsDir, 'clean-architecture'), { recursive: true });
    mkdirSync(join(skillsDir, 'ddd'), { recursive: true });
    writeFileSync(join(skillsDir, 'README.md'), 'not a skill directory');

    const signals = gateway.readSignals(projectPath);

    expect(signals.skillDirectoryNames.sort()).toEqual(['clean-architecture', 'ddd']);
  });
});
