import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { SkillTemplateFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/skillTemplate.fileSystem.gateway.js';

const MCP_SERVER_PATH = '/opt/reviewflow/dist/mcpServer.js';

describe('SkillTemplateFileSystemGateway (integration with real filesystem)', () => {
  let projectPath: string;
  let gateway: SkillTemplateFileSystemGateway;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'skill-template-'));
    gateway = new SkillTemplateFileSystemGateway({ mcpServerPath: MCP_SERVER_PATH });
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('writes a rendered SKILL.md under .claude/skills for the given language', () => {
    gateway.writeSkill(projectPath, 'review-back', 'en');

    const skillPath = join(projectPath, '.claude', 'skills', 'review-back', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, 'utf-8')).toContain('# Skill: review-back');
    expect(readFileSync(skillPath, 'utf-8')).toContain('# Goal');
  });

  it('does not overwrite an existing SKILL.md', () => {
    const skillPath = join(projectPath, '.claude', 'skills', 'review-back', 'SKILL.md');
    mkdirSync(join(projectPath, '.claude', 'skills', 'review-back'), { recursive: true });
    writeFileSync(skillPath, 'PRESERVED', 'utf-8');

    gateway.writeSkill(projectPath, 'review-back', 'fr');

    expect(readFileSync(skillPath, 'utf-8')).toBe('PRESERVED');
  });

  it('writes the .mcp.json wiring the review-progress server to the mcp server path', () => {
    gateway.writeMcpJson(projectPath);

    const mcpPath = join(projectPath, '.mcp.json');
    expect(existsSync(mcpPath)).toBe(true);
    expect(JSON.parse(readFileSync(mcpPath, 'utf-8'))).toEqual({
      mcpServers: {
        'review-progress': {
          command: 'node',
          args: [MCP_SERVER_PATH],
        },
      },
    });
  });

  it('does not overwrite an existing .mcp.json', () => {
    const mcpPath = join(projectPath, '.mcp.json');
    writeFileSync(mcpPath, '{"keep":true}', 'utf-8');

    gateway.writeMcpJson(projectPath);

    expect(readFileSync(mcpPath, 'utf-8')).toBe('{"keep":true}');
  });
});
