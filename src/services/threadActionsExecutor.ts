import { execSync } from 'node:child_process'
import type { ThreadAction } from './threadActionsParser.js'

export interface ExecutionContext {
  platform: 'gitlab' | 'github'
  projectPath: string
  mrNumber: number
  localPath: string
}

export interface ExecutionResult {
  total: number
  succeeded: number
  failed: number
  skipped: number
}

export type CommandExecutor = (
  command: string,
  args: string[],
  cwd: string
) => void

interface Logger {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
  debug: (obj: object, msg: string) => void
}

function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, '%2F')
}

function buildGitLabCommand(
  action: ThreadAction,
  context: ExecutionContext
): { command: string; args: string[] } | null {
  const encodedProject = encodeProjectPath(context.projectPath)
  const baseUrl = `projects/${encodedProject}/merge_requests/${context.mrNumber}`

  switch (action.type) {
    case 'THREAD_REPLY':
      return {
        command: 'glab',
        args: [
          'api',
          '--method',
          'POST',
          `${baseUrl}/discussions/${action.threadId}/notes`,
          '--field',
          `body=${action.message}`,
        ],
      }
    case 'THREAD_RESOLVE':
      return {
        command: 'glab',
        args: [
          'api',
          '--method',
          'PUT',
          `${baseUrl}/discussions/${action.threadId}`,
          '--field',
          'resolved=true',
        ],
      }
    case 'POST_COMMENT':
      return {
        command: 'glab',
        args: [
          'api',
          '--method',
          'POST',
          `${baseUrl}/notes`,
          '--field',
          `body=${action.message}`,
        ],
      }
    case 'FETCH_THREADS':
      return null
  }
}

function buildGitHubCommand(
  action: ThreadAction,
  context: ExecutionContext
): { command: string; args: string[] } | null {
  switch (action.type) {
    case 'THREAD_REPLY':
      return {
        command: 'gh',
        args: [
          'api',
          '--method',
          'POST',
          `repos/${context.projectPath}/pulls/${context.mrNumber}/comments/${action.threadId}/replies`,
          '--field',
          `body=${action.message}`,
        ],
      }
    case 'THREAD_RESOLVE':
      return {
        command: 'gh',
        args: [
          'api',
          'graphql',
          '-f',
          `query=mutation { resolveReviewThread(input: {threadId: "${action.threadId}"}) { thread { id isResolved } } }`,
        ],
      }
    case 'POST_COMMENT':
      return {
        command: 'gh',
        args: [
          'api',
          '--method',
          'POST',
          `repos/${context.projectPath}/issues/${context.mrNumber}/comments`,
          '--field',
          `body=${action.message}`,
        ],
      }
    case 'FETCH_THREADS':
      return null
  }
}

export async function executeThreadActions(
  actions: ThreadAction[],
  context: ExecutionContext,
  logger: Logger,
  executor: CommandExecutor
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    total: actions.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  }

  for (const action of actions) {
    const commandInfo =
      context.platform === 'gitlab'
        ? buildGitLabCommand(action, context)
        : buildGitHubCommand(action, context)

    if (commandInfo === null) {
      logger.debug({ action: action.type }, 'Action skipped (no-op)')
      result.skipped++
      continue
    }

    try {
      executor(commandInfo.command, commandInfo.args, context.localPath)
      result.succeeded++
      logger.info(
        { action: action.type, threadId: 'threadId' in action ? action.threadId : undefined },
        'Thread action executed successfully'
      )
    } catch (error) {
      result.failed++
      logger.error(
        {
          action: action.type,
          error: error instanceof Error ? error.message : String(error),
        },
        'Thread action failed'
      )
    }
  }

  return result
}

export const defaultCommandExecutor: CommandExecutor = (
  command: string,
  args: string[],
  cwd: string
): void => {
  execSync(`${command} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
  })
}
