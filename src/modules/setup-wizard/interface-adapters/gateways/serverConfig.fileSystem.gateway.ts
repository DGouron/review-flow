import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import type {
  ServerConfigGateway,
  ServerConfigEntry,
} from '@/modules/setup-wizard/entities/serverConfig/serverConfig.gateway.js';

interface ServerConfigFileSystemGatewayDependencies {
  configPath: string;
}

const repositoryEntrySchema = z.object({
  name: z.string().optional(),
  localPath: z.string().optional(),
  enabled: z.boolean().optional(),
});

const serverConfigShapeSchema = z.looseObject({
  repositories: z.array(repositoryEntrySchema).optional(),
});

type ServerConfigShape = z.infer<typeof serverConfigShapeSchema>;

function parseServerConfig(raw: string): ServerConfigShape {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = serverConfigShapeSchema.safeParse(parsed);
    if (result.success) return result.data;
    return { repositories: [] };
  } catch {
    return { repositories: [] };
  }
}

export class ServerConfigFileSystemGateway implements ServerConfigGateway {
  constructor(private readonly deps: ServerConfigFileSystemGatewayDependencies) {}

  private load(): ServerConfigShape {
    if (!existsSync(this.deps.configPath)) {
      return { repositories: [] };
    }
    const raw = readFileSync(this.deps.configPath, 'utf-8');
    const config = parseServerConfig(raw);
    if (!Array.isArray(config.repositories)) {
      config.repositories = [];
    }
    return config;
  }

  hasProject(localPath: string): boolean {
    const config = this.load();
    return (config.repositories ?? []).some((repo) => repo.localPath === localPath);
  }

  addProject(entry: ServerConfigEntry): void {
    const config = this.load();
    const repositories = config.repositories ?? [];
    if (repositories.some((repo) => repo.localPath === entry.localPath)) return;
    repositories.push({ name: entry.name, localPath: entry.localPath, enabled: entry.enabled });
    config.repositories = repositories;
    mkdirSync(dirname(this.deps.configPath), { recursive: true });
    writeFileSync(this.deps.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }
}
