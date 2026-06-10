import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type { Language } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import type { SkillTemplateGateway } from '@/modules/setup-wizard/entities/skillTemplate/skillTemplate.gateway.js';
import { renderSkill } from '@/modules/setup-wizard/services/skillTemplateRenderer.js';

interface SkillTemplateFileSystemGatewayDependencies {
  mcpServerPath: string;
}

export class SkillTemplateFileSystemGateway implements SkillTemplateGateway {
  constructor(private readonly deps: SkillTemplateFileSystemGatewayDependencies) {}

  writeSkill(projectPath: string, skillName: string, language: Language): void {
    const path = join(projectPath, '.claude', 'skills', skillName, 'SKILL.md');
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) return;
    writeFileSync(path, renderSkill(skillName, language), 'utf-8');
  }

  writeMcpJson(projectPath: string): void {
    const path = join(projectPath, '.mcp.json');
    if (existsSync(path)) return;
    const content = {
      mcpServers: {
        'review-progress': {
          command: 'node',
          args: [this.deps.mcpServerPath],
        },
      },
    };
    writeFileSync(path, JSON.stringify(content, null, 2), 'utf-8');
  }
}
