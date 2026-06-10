import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { InstallTypeDetectorFsGateway } from '@/modules/cli-configuration/interface-adapters/gateways/installTypeDetector.fs.gateway.js';

describe('InstallTypeDetectorFsGateway', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'install-type-detector-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns source-checkout when a .git directory exists at the start path', () => {
    mkdirSync(join(tempRoot, '.git'));
    const detector = new InstallTypeDetectorFsGateway(tempRoot);

    expect(detector.detect()).toBe('source-checkout');
  });

  it('returns source-checkout when a .git directory exists in a parent path', () => {
    mkdirSync(join(tempRoot, '.git'));
    const startPath = join(tempRoot, 'dist', 'main');
    mkdirSync(startPath, { recursive: true });
    const detector = new InstallTypeDetectorFsGateway(startPath);

    expect(detector.detect()).toBe('source-checkout');
  });

  it('returns source-checkout when .git is a worktree pointer file', () => {
    writeFileSync(join(tempRoot, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
    const detector = new InstallTypeDetectorFsGateway(tempRoot);

    expect(detector.detect()).toBe('source-checkout');
  });

  it('returns global-npm when no .git exists anywhere from the start path up to the filesystem root', () => {
    const startPath = join(tempRoot, 'lib', 'node_modules', 'reviewflow', 'dist');
    mkdirSync(startPath, { recursive: true });
    const detector = new InstallTypeDetectorFsGateway(startPath);

    expect(detector.detect()).toBe('global-npm');
  });
});
