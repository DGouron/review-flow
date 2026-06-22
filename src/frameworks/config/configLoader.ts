import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';

import {
  type ReviewFocus,
  isReviewFocus,
  reviewSkillForFocus,
} from '@/modules/review-execution/entities/progress/reviewFocus.type.js';
import type { RepositoryConfig } from '@/modules/shared-kernel/entities/repositoryConfig/repositoryConfig.js';

import { getConfigDir } from '../../shared/services/configDir.js';

const configDir = getConfigDir();
const xdgEnvPath = join(configDir, '.env');

if (existsSync(xdgEnvPath)) {
  loadEnv({ path: xdgEnvPath });
} else {
  loadEnv();
}

// Types for simplified config input
interface RepositoryInput {
  name: string;
  localPath: string;
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
  jobHistoryRetentionDays: number;
}

export type TriggerMode = 'full-auto' | 'semi-auto';

export interface Config {
  server: ServerConfig;
  user: UserConfig;
  queue: QueueConfig;
  repositories: RepositoryConfig[];
  triggerMode: TriggerMode;
  maxDiffLines?: number;
}

export interface EnvSecrets {
  gitlabWebhookToken: string;
  githubWebhookSecret: string;
}

interface ProjectConfig {
  github?: boolean;
  gitlab?: boolean;
  reviewSkill?: string;
  reviewFocus?: ReviewFocus;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return { ...value };
}

function loadProjectConfig(localPath: string): ProjectConfig | null {
  const configPath = join(localPath, '.claude', 'reviews', 'config.json');
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsedJson: unknown = JSON.parse(content);
    if (parsedJson === null) {
      return null;
    }
    const parsed = toRecord(parsedJson) ?? {};
    const result: ProjectConfig = {};
    if (typeof parsed.github === 'boolean') {
      result.github = parsed.github;
    }
    if (typeof parsed.gitlab === 'boolean') {
      result.gitlab = parsed.gitlab;
    }
    if (typeof parsed.reviewSkill === 'string') {
      result.reviewSkill = parsed.reviewSkill;
    }
    if (isReviewFocus(parsed.reviewFocus)) {
      result.reviewFocus = parsed.reviewFocus;
    }
    return result;
  } catch {
    return null;
  }
}

export function normalizeGitUrl(url: string): string {
  // Convert SSH URLs (git@host:org/repo.git) to HTTPS (https://host/org/repo)
  const sshMatch = url.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/, '')}`;
  }
  return url.replace(/\.git$/, '');
}

function getGitRemoteUrl(localPath: string): string | null {
  try {
    const result = execSync('git remote get-url origin', {
      cwd: localPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return normalizeGitUrl(result.trim());
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
  const skill =
    projectConfig.reviewSkill ||
    (projectConfig.reviewFocus ? reviewSkillForFocus(projectConfig.reviewFocus) : 'review-code');

  return {
    name: input.name,
    platform,
    remoteUrl,
    localPath: input.localPath,
    skill,
    enabled: input.enabled,
  };
}

export function enrichSingleRepository(input: RepositoryInput): RepositoryConfig {
  const projectConfig = loadProjectConfig(input.localPath);
  const remoteUrl = getGitRemoteUrl(input.localPath);

  const platform: 'gitlab' | 'github' = projectConfig?.gitlab ? 'gitlab' : 'github';
  const skill =
    projectConfig?.reviewSkill ||
    (projectConfig?.reviewFocus ? reviewSkillForFocus(projectConfig.reviewFocus) : 'review-code');

  return {
    name: input.name,
    platform,
    remoteUrl: remoteUrl ?? '',
    localPath: input.localPath,
    skill,
    enabled: input.enabled,
  };
}

export function validateAndEnrichConfig(data: unknown): Config {
  const config = toRecord(data);
  if (!config) {
    throw new Error('Configuration invalide : objet attendu');
  }

  // Validate server
  const server = toRecord(config.server);
  if (!server) {
    throw new Error('Configuration invalide : section "server" manquante');
  }
  const port = server.port;
  if (typeof port !== 'number' || port < 1 || port > 65535) {
    throw new Error('Configuration invalide : port invalide');
  }

  // Validate user
  const user = toRecord(config.user);
  if (!user) {
    throw new Error('Configuration invalide : section "user" manquante');
  }
  const gitlabUsername = user.gitlabUsername;
  if (typeof gitlabUsername !== 'string') {
    throw new Error('Invalid configuration: gitlabUsername must be a string');
  }
  const githubUsername = user.githubUsername;
  if (typeof githubUsername !== 'string') {
    throw new Error('Invalid configuration: githubUsername must be a string');
  }

  // Validate queue
  const queue = toRecord(config.queue);
  if (!queue) {
    throw new Error('Configuration invalide : section "queue" manquante');
  }
  const maxConcurrent = queue.maxConcurrent;
  if (typeof maxConcurrent !== 'number' || maxConcurrent < 1) {
    throw new Error('Configuration invalide : maxConcurrent invalide');
  }
  const deduplicationWindowMs = queue.deduplicationWindowMs;
  if (typeof deduplicationWindowMs !== 'number' || deduplicationWindowMs < 0) {
    throw new Error('Configuration invalide : deduplicationWindowMs invalide');
  }

  let jobHistoryRetentionDays = 7;
  if (queue.jobHistoryRetentionDays !== undefined && queue.jobHistoryRetentionDays !== null) {
    if (
      typeof queue.jobHistoryRetentionDays !== 'number' ||
      !Number.isInteger(queue.jobHistoryRetentionDays) ||
      queue.jobHistoryRetentionDays < 1 ||
      queue.jobHistoryRetentionDays > 365
    ) {
      throw new Error('Configuration invalide : jobHistoryRetentionDays invalide');
    }
    jobHistoryRetentionDays = queue.jobHistoryRetentionDays;
  }

  // Validate triggerMode (optional, defaults to 'full-auto')
  let triggerMode: TriggerMode = 'full-auto';
  if (config.triggerMode !== undefined && config.triggerMode !== null) {
    if (config.triggerMode !== 'full-auto' && config.triggerMode !== 'semi-auto') {
      throw new Error(
        'Mode de déclenchement invalide : valeurs autorisées « full-auto » ou « semi-auto »',
      );
    }
    triggerMode = config.triggerMode;
  }

  // Validate maxDiffLines (optional, falls back to the per-call default when absent)
  let maxDiffLines: number | undefined;
  if (config.maxDiffLines !== undefined && config.maxDiffLines !== null) {
    if (
      typeof config.maxDiffLines !== 'number' ||
      !Number.isInteger(config.maxDiffLines) ||
      config.maxDiffLines < 1
    ) {
      throw new Error('Configuration invalide : maxDiffLines invalide');
    }
    maxDiffLines = config.maxDiffLines;
  }

  // Validate and enrich repositories
  if (!Array.isArray(config.repositories)) {
    throw new Error('Configuration invalide : repositories doit être un tableau');
  }

  const enrichedRepositories: RepositoryConfig[] = [];

  for (const repo of config.repositories) {
    const repositoryRecord = toRecord(repo);
    if (!repositoryRecord) {
      throw new Error('Configuration invalide : repository invalide');
    }

    const name = repositoryRecord.name;
    if (typeof name !== 'string' || !name) {
      throw new Error('Configuration invalide : name manquant');
    }
    const localPath = repositoryRecord.localPath;
    if (typeof localPath !== 'string' || !localPath) {
      throw new Error('Configuration invalide : localPath manquant');
    }
    const enabled = repositoryRecord.enabled;
    if (typeof enabled !== 'boolean') {
      throw new Error('Configuration invalide : enabled doit être un booléen');
    }

    const input: RepositoryInput = { name, localPath, enabled };

    const enriched = enrichRepository(input);
    if (enriched) {
      enrichedRepositories.push(enriched);
    }
  }

  const result: Config = {
    server: { port },
    user: { gitlabUsername, githubUsername },
    queue: {
      maxConcurrent,
      deduplicationWindowMs,
      jobHistoryRetentionDays,
    },
    repositories: enrichedRepositories,
    triggerMode,
  };

  if (maxDiffLines !== undefined) {
    result.maxDiffLines = maxDiffLines;
  }

  return result;
}

function loadSecrets(): EnvSecrets {
  const gitlabWebhookToken = process.env.GITLAB_WEBHOOK_TOKEN;
  const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!gitlabWebhookToken) {
    throw new Error("Variable d'environnement GITLAB_WEBHOOK_TOKEN manquante");
  }
  if (!githubWebhookSecret) {
    throw new Error("Variable d'environnement GITHUB_WEBHOOK_SECRET manquante");
  }

  return { gitlabWebhookToken, githubWebhookSecret };
}

// Main loader
let cachedConfig: Config | null = null;
let cachedSecrets: EnvSecrets | null = null;

function resolveConfigPath(): string {
  if (process.env.CONFIG_PATH) return process.env.CONFIG_PATH;
  const cwdPath = join(process.cwd(), 'config.json');
  if (existsSync(cwdPath)) return cwdPath;
  const xdgPath = join(configDir, 'config.json');
  if (existsSync(xdgPath)) return xdgPath;
  return cwdPath;
}

export function resolveActiveConfigPath(): string {
  return resolveConfigPath();
}

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const configPath = resolveConfigPath();

  if (!existsSync(configPath)) {
    throw new Error(
      `Configuration file not found: ${configPath}\nRun 'reviewflow init' to create one.`,
    );
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
    url
      .replace(/\.git$/, '')
      .replace(/\/$/, '')
      .toLowerCase();

  const normalizedInput = normalizeUrl(remoteUrl);

  return config.repositories.find(
    (repo) => repo.enabled && normalizeUrl(repo.remoteUrl) === normalizedInput,
  );
}

export function findRepositoryByProjectPath(projectPath: string): RepositoryConfig | undefined {
  const config = loadConfig();

  const normalizedPath = projectPath.toLowerCase();

  return config.repositories.find((repo) => {
    if (!repo.enabled) return false;
    const urlPath = repo.remoteUrl
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/\.git$/, '')
      .toLowerCase();
    return urlPath === normalizedPath;
  });
}
