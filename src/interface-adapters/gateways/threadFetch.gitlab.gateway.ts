import { execSync } from 'node:child_process'
import type { ThreadFetchGateway } from '../../entities/threadFetch/threadFetch.gateway.js'
import type { ReviewContextThread } from '../../entities/reviewContext/reviewContext.js'

export type CommandExecutor = (command: string) => string

export const defaultGitLabExecutor: CommandExecutor = (command: string) => {
  return execSync(command, { encoding: 'utf-8', timeout: 30000 })
}

interface GitLabNotePosition {
  new_path: string | null
  new_line: number | null
}

interface GitLabNote {
  resolvable: boolean
  resolved: boolean
  body: string
  position: GitLabNotePosition | null
}

interface GitLabDiscussion {
  id: string
  notes: GitLabNote[]
}

export class GitLabThreadFetchGateway implements ThreadFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchThreads(projectPath: string, mergeRequestNumber: number): ReviewContextThread[] {
    const encodedProject = projectPath.replace(/\//g, '%2F')
    const response = this.executor(
      `glab api projects/${encodedProject}/merge_requests/${mergeRequestNumber}/discussions`
    )
    const discussions: GitLabDiscussion[] = JSON.parse(response)

    const threads: ReviewContextThread[] = []

    for (const discussion of discussions) {
      const firstNote = discussion.notes[0]
      if (!firstNote?.resolvable) continue

      threads.push({
        id: discussion.id,
        file: firstNote.position?.new_path ?? null,
        line: firstNote.position?.new_line ?? null,
        status: firstNote.resolved ? 'resolved' : 'open',
        body: firstNote.body,
      })
    }

    return threads
  }
}
