import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type {
  DeclaredPrincipleSignals,
  ProjectPrinciplesGateway,
} from '@/modules/review-execution/entities/progress/projectPrinciples.gateway.js';

export class ProjectPrinciplesFileSystemGateway implements ProjectPrinciplesGateway {
  readSignals(localPath: string): DeclaredPrincipleSignals {
    return {
      claudeMd: this.readClaudeMd(localPath),
      skillDirectoryNames: this.listSkillDirectoryNames(localPath),
    };
  }

  private readClaudeMd(localPath: string): string | null {
    const claudeMdPath = join(localPath, 'CLAUDE.md');
    if (!existsSync(claudeMdPath)) {
      return null;
    }
    return readFileSync(claudeMdPath, 'utf-8');
  }

  private listSkillDirectoryNames(localPath: string): string[] {
    const skillsPath = join(localPath, '.claude', 'skills');
    if (!existsSync(skillsPath)) {
      return [];
    }
    return readdirSync(skillsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }
}
