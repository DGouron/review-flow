import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

const SRC_ROOT = join(process.cwd(), 'src');

const ALLOWED_PATHS: string[] = [
  'src/cli/parseCliArgs.ts',
  'src/tests/units/architecture/noClaudePInProduction.test.ts',
];

// Files allowed to mention StreamJsonParser / ProgressParser by name. Both
// modules are kept as Strangler Fig anchors (SPEC-169 FR-8) but must not be
// reintroduced into the production review dispatch path. Only their own files
// and the `src/claude/` strangler re-export may reference them.
const LEGACY_PARSER_ALLOWED_PATHS: string[] = [
  'src/frameworks/claude/streamJsonParser.ts',
  'src/frameworks/claude/progressParser.ts',
  'src/claude/progressParser.ts',
];

function listTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      results.push(...listTsFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function relativePath(absolutePath: string): string {
  return absolutePath.startsWith(process.cwd())
    ? absolutePath.slice(process.cwd().length + 1)
    : absolutePath;
}

function isAllowed(relPath: string): boolean {
  return ALLOWED_PATHS.includes(relPath);
}

describe('Architecture rule: no `claude -p` or `claude --print` in production review dispatch', () => {
  it('rejects forbidden invocation flags everywhere except the documented allowlist', () => {
    const offenders: Array<{ file: string; line: number; content: string }> = [];

    for (const file of listTsFiles(SRC_ROOT)) {
      const rel = relativePath(file);
      if (isAllowed(rel)) continue;
      if (rel.startsWith('src/tests/')) continue;

      const text = readFileSync(file, 'utf-8');
      const lines = text.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (/['"]-p['"]/.test(line) || /['"]--print['"]/.test(line)) {
          offenders.push({ file: rel, line: index + 1, content: line.trim() });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('Architecture rule: legacy stream-json / progress parser imports are confined to their own modules (SPEC-169 I5)', () => {
  it('rejects StreamJsonParser and ProgressParser imports in production source outside the allowlist', () => {
    const offenders: Array<{ file: string; line: number; content: string }> = [];

    for (const file of listTsFiles(SRC_ROOT)) {
      const rel = relativePath(file);
      if (LEGACY_PARSER_ALLOWED_PATHS.includes(rel)) continue;
      if (rel.startsWith('src/tests/')) continue;

      const text = readFileSync(file, 'utf-8');
      const lines = text.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const isImportLine = /\bimport\b/.test(line) || /\bfrom\b/.test(line);
        if (!isImportLine) continue;
        if (/\bStreamJsonParser\b/.test(line) || /\bProgressParser\b/.test(line)) {
          offenders.push({ file: rel, line: index + 1, content: line.trim() });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
