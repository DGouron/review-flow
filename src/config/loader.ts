import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

// Types for simplified config input
interface RepositoryInput {
  name: string;
  localPath: string;
  enabled: boolean;
}

// Types for enriched config
export interface RepositoryConfig {
  name: string;
  platform: 'gitlab' | 'github';
  remoteUrl: string;
  localPath: string;
  skill: string;
  enabled: boolean;
}

export interface ServerConfig {
  port: number;
}

export interface UserConfig {
  gitlabUsername: string;
  githubUsername: string;
}

export interface QueueConfig {
  maxConcurrent: number;
  deduplicationWindowMs: number;
}

export interface Config {
  server: ServerConfig;
  user: UserConfig;
  queue: QueueConfig;
  repositories: RepositoryConfig[];
}

export interface EnvSecrets {
  gitlabWebhookToken: string;
  githubWebhookSecret: string;
}

interface ProjectConfig {
  github?: boolean;
  gitlab?: boolean;
  reviewSkill?: string;
}

function loadProjectConfig(localPath: string): ProjectConfig | null {
  const configPath = join(localPath, '.claude', 'reviews', 'config.json');
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return null;
  }
}

function getGitRemoteUrl(localPath: string): string | null {
  try {
    const result = execSync('git remote get-url origin', {
      cwd: localPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.trim().replace(/\.git$/, '');
  } catch {
    return null;
  }
}

function enrichRepository(input: RepositoryInput): RepositoryConfig | null {
  const projectConfig = loadProjectConfig(input.localPath);
  const remoteUrl = getGitRemoteUrl(input.localPath);

  if (!projectConfig) {
    console.warn(`[config] Pas de config projet pour ${input.name} (${input.localPath})`);
    return null;
  }

  if (!remoteUrl) {
    console.warn(`[config] Pas de remote git pour ${input.name} (${input.localPath})`);
    return null;
  }

  const platform: 'gitlab' | 'github' = projectConfig.gitlab ? 'gitlab' : 'github';
  const skill = projectConfig.reviewSkill || 'review-code';

  return {
    name: input.name,
    platform,
    remoteUrl,
    localPath: input.localPath,
    skill,
    enabled: input.enabled,
  };
}

function validateAndEnrichConfig(data: unknown): Config {
  if (!data || typeof data !== 'object') {
    throw new Error('Configuration invalide : objet attendu');
  }

  const config = data as Record<string, unknown>;

  // Validate server
  if (!config.server || typeof config.server !== 'object') {
    throw new Error('Configuration invalide : section "server" manquante');
  }
  const server = config.server as Record<string, unknown>;
  if (typeof server.port !== 'number' || server.port < 1 || server.port > 65535) {
    throw new Error('Configuration invalide : port invalide');
  }

  // Validate user
  if (!config.user || typeof config.user !== 'object') {
    throw new Error('Configuration invalide : section "user" manquante');
  }
  const user = config.user as Record<string, unknown>;
  if (typeof user.gitlabUsername !== 'string' || !user.gitlabUsername) {
    throw new Error('Configuration invalide : gitlabUsername manquant');
  }
  if (typeof user.githubUsername !== 'string' || !user.githubUsername) {
    throw new Error('Configuration invalide : githubUsername manquant');
  }

  // Validate queue
  if (!config.queue || typeof config.queue !== 'object') {
    throw new Error('Configuration invalide : section "queue" manquante');
  }
  const queue = config.queue as Record<string, unknown>;
  if (typeof queue.maxConcurrent !== 'number' || queue.maxConcurrent < 1) {
    throw new Error('Configuration invalide : maxConcurrent invalide');
  }
  if (typeof queue.deduplicationWindowMs !== 'number' || queue.deduplicationWindowMs < 0) {
    throw new Error('Configuration invalide : deduplicationWindowMs invalide');
  }

  // Validate and enrich repositories
  if (!Array.isArray(config.repositories)) {
    throw new Error('Configuration invalide : repositories doit être un tableau');
  }

  const enrichedRepositories: RepositoryConfig[] = [];

  for (const repo of config.repositories) {
    if (!repo || typeof repo !== 'object') {
      throw new Error('Configuration invalide : repository invalide');
    }
    const r = repo as Record<string, unknown>;

    if (typeof r.name !== 'string' || !r.name) {
      throw new Error('Configuration invalide : name manquant');
    }
    if (typeof r.localPath !== 'string' || !r.localPath) {
      throw new Error('Configuration invalide : localPath manquant');
    }
    if (typeof r.enabled !== 'boolean') {
      throw new Error('Configuration invalide : enabled doit être un booléen');
    }

    const input: RepositoryInput = {
      name: r.name as string,
      localPath: r.localPath as string,
      enabled: r.enabled as boolean,
    };

    const enriched = enrichRepository(input);
    if (enriched) {
      enrichedRepositories.push(enriched);
    }
  }

  return {
    server: { port: server.port as number },
    user: {
      gitlabUsername: user.gitlabUsername as string,
      githubUsername: user.githubUsername as string,
    },
    queue: {
      maxConcurrent: queue.maxConcurrent as number,
      deduplicationWindowMs: queue.deduplicationWindowMs as number,
    },
    repositories: enrichedRepositories,
  };
}

function loadSecrets(): EnvSecrets {
  const gitlabWebhookToken = process.env.GITLAB_WEBHOOK_TOKEN;
  const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!gitlabWebhookToken) {
    throw new Error('Variable d\'environnement GITLAB_WEBHOOK_TOKEN manquante');
  }
  if (!githubWebhookSecret) {
    throw new Error('Variable d\'environnement GITHUB_WEBHOOK_SECRET manquante');
  }

  return { gitlabWebhookToken, githubWebhookSecret };
}

// Main loader
let cachedConfig: Config | null = null;
let cachedSecrets: EnvSecrets | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const configPath = process.env.CONFIG_PATH || join(process.cwd(), 'config.json');

  if (!existsSync(configPath)) {
    throw new Error(`Fichier de configuration non trouvé : ${configPath}`);
  }

  const rawContent = readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(rawContent);
  cachedConfig = validateAndEnrichConfig(parsed);

  return cachedConfig;
}

export function loadEnvSecrets(): EnvSecrets {
  if (cachedSecrets) return cachedSecrets;
  cachedSecrets = loadSecrets();
  return cachedSecrets;
}

export function findRepositoryByRemoteUrl(remoteUrl: string): RepositoryConfig | undefined {
  const config = loadConfig();

  const normalizeUrl = (url: string) =>
    url.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();

  const normalizedInput = normalizeUrl(remoteUrl);

  return config.repositories.find(
    repo => repo.enabled && normalizeUrl(repo.remoteUrl) === normalizedInput
  );
}

export function findRepositoryByProjectPath(projectPath: string): RepositoryConfig | undefined {
  const config = loadConfig();

  const normalizedPath = projectPath.toLowerCase();

  return config.repositories.find(repo => {
    if (!repo.enabled) return false;
    const urlPath = repo.remoteUrl
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/\.git$/, '')
      .toLowerCase();
    return urlPath === normalizedPath;
  });
}
