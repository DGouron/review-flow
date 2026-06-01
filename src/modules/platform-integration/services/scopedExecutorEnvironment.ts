import { join } from 'node:path'

export const EXECUTOR_TOKEN_ENV_KEY = 'REVIEWFLOW_EXECUTOR_TOKEN'

export const ENV_ALLOWLIST = ['PATH', 'HOME', 'GLAB_CONFIG_DIR', 'LANG'] as const

export type AllowlistedEnvKey = (typeof ENV_ALLOWLIST)[number]

export type ScopedExecutorEnv = Partial<Record<AllowlistedEnvKey, string>>

export class MissingExecutorTokenError extends Error {
  constructor() {
    super(
      `Executor service token (${EXECUTOR_TOKEN_ENV_KEY}) is absent or empty; refusing to start with the ambient token.`,
    )
    this.name = 'MissingExecutorTokenError'
  }
}

export interface ExecutorFileWriter {
  write(path: string, contents: string): void
  ensureDir(path: string): void
}

export interface BuildScopedExecutorEnvironmentInput {
  parentEnv: Record<string, string | undefined>
  isolatedDir: string
  fileWriter: ExecutorFileWriter
}

export interface ScopedExecutorEnvironment {
  env: ScopedExecutorEnv
  configFilePath: string
}

function renderGlabConfig(token: string): string {
  return [
    'hosts:',
    '  gitlab.com:',
    `    token: ${token}`,
    '    api_protocol: https',
    '',
  ].join('\n')
}

export function buildScopedExecutorEnvironment(
  input: BuildScopedExecutorEnvironmentInput,
): ScopedExecutorEnvironment {
  const token = input.parentEnv[EXECUTOR_TOKEN_ENV_KEY]?.trim()
  if (!token) {
    throw new MissingExecutorTokenError()
  }

  const home = join(input.isolatedDir, 'home')
  const glabConfigDir = join(input.isolatedDir, 'glab-config')

  const env: ScopedExecutorEnv = {
    HOME: home,
    GLAB_CONFIG_DIR: glabConfigDir,
  }

  const path = input.parentEnv.PATH
  if (path) env.PATH = path

  const lang = input.parentEnv.LANG
  if (lang) env.LANG = lang

  // cwd at spawn time is HOME and glab reads GLAB_CONFIG_DIR; both directories
  // must exist on disk before the spawn, else execSync fails with ENOENT.
  input.fileWriter.ensureDir(home)
  input.fileWriter.ensureDir(glabConfigDir)

  // When GLAB_CONFIG_DIR is set, glab reads its config at the root of that dir
  // (config.yml directly); the glab-cli/ subdir only applies under HOME.
  const configFilePath = join(glabConfigDir, 'config.yml')
  input.fileWriter.write(configFilePath, renderGlabConfig(token))

  return { env, configFilePath }
}
