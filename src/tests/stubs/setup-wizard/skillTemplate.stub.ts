import type { Language } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import type { SkillTemplateGateway } from '@/modules/setup-wizard/entities/skillTemplate/skillTemplate.gateway.js';

interface WrittenSkill {
  projectPath: string;
  skillName: string;
  language: Language;
}

export class StubSkillTemplateGateway implements SkillTemplateGateway {
  public skills: WrittenSkill[] = [];
  public mcpJsonWrites: string[] = [];

  writeSkill(projectPath: string, skillName: string, language: Language): void {
    this.skills.push({ projectPath, skillName, language });
  }

  writeMcpJson(projectPath: string): void {
    this.mcpJsonWrites.push(projectPath);
  }
}
