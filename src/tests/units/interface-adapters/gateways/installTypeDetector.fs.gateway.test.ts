import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { InstallTypeDetectorFsGateway } from '@/modules/cli-configuration/interface-adapters/gateways/installTypeDetector.fs.gateway.js';

function writePackageManifest(directory: string, name: string): void {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name }));
}

describe('InstallTypeDetectorFsGateway', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'install-type-detector-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns source-checkout when the start path is a reviewflow git checkout', () => {
    mkdirSync(join(tempRoot, '.git'));
    writePackageManifest(tempRoot, 'reviewflow');
    const detector = new InstallTypeDetectorFsGateway(tempRoot);

    expect(detector.detect()).toBe('source-checkout');
  });

  it('returns source-checkout when a parent path is a reviewflow git checkout', () => {
    mkdirSync(join(tempRoot, '.git'));
    writePackageManifest(tempRoot, 'reviewflow');
    const startPath = join(tempRoot, 'dist', 'main');
    mkdirSync(startPath, { recursive: true });
    const detector = new InstallTypeDetectorFsGateway(startPath);

    expect(detector.detect()).toBe('source-checkout');
  });

  it('returns source-checkout when .git is a worktree pointer file', () => {
    writeFileSync(join(tempRoot, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
    writePackageManifest(tempRoot, 'reviewflow');
    const detector = new InstallTypeDetectorFsGateway(tempRoot);

    expect(detector.detect()).toBe('source-checkout');
  });

  it('returns global-npm when no .git exists anywhere from the start path up to the filesystem root', () => {
    const startPath = join(tempRoot, 'lib', 'node_modules', 'reviewflow', 'dist');
    mkdirSync(startPath, { recursive: true });
    const detector = new InstallTypeDetectorFsGateway(startPath);

    expect(detector.detect()).toBe('global-npm');
  });

  it('returns global-npm when the global npm prefix lives inside a foreign git repository', () => {
    const nodeManagerRoot = join(tempRoot, '.nvm');
    mkdirSync(join(nodeManagerRoot, '.git'), { recursive: true });
    writePackageManifest(nodeManagerRoot, 'nvm');
    const packageRoot = join(
      nodeManagerRoot,
      'versions',
      'node',
      'v26',
      'lib',
      'node_modules',
      'reviewflow',
    );
    const startPath = join(packageRoot, 'dist', 'main');
    mkdirSync(startPath, { recursive: true });
    writePackageManifest(packageRoot, 'reviewflow');
    const detector = new InstallTypeDetectorFsGateway(startPath);

    expect(detector.detect()).toBe('global-npm');
  });

  it('returns global-npm when the enclosing git repository has no package manifest', () => {
    mkdirSync(join(tempRoot, '.git'));
    const startPath = join(tempRoot, 'lib', 'node_modules', 'reviewflow', 'dist');
    mkdirSync(startPath, { recursive: true });
    const detector = new InstallTypeDetectorFsGateway(startPath);

    expect(detector.detect()).toBe('global-npm');
  });
});
