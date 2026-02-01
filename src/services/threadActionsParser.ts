export interface ThreadReplyAction {
  type: 'THREAD_REPLY'
  threadId: string
  message: string
}

export interface ThreadResolveAction {
  type: 'THREAD_RESOLVE'
  threadId: string
}

export interface PostCommentAction {
  type: 'POST_COMMENT'
  message: string
}

export interface FetchThreadsAction {
  type: 'FETCH_THREADS'
}

export type ThreadAction =
  | ThreadReplyAction
  | ThreadResolveAction
  | PostCommentAction
  | FetchThreadsAction

const THREAD_REPLY_REGEX = /\[THREAD_REPLY:([^:\]]+):([^\]]*)\]/g
const THREAD_RESOLVE_REGEX = /\[THREAD_RESOLVE:([^\]]+)\]/g
const POST_COMMENT_REGEX = /\[POST_COMMENT:([^\]]+)\]/g
const FETCH_THREADS_REGEX = /\[FETCH_THREADS\]/g

interface MarkerMatch {
  index: number
  action: ThreadAction
}

function unescapeNewlines(message: string): string {
  return message.replace(/\\n/g, '\n')
}

export function parseThreadActions(stdout: string): ThreadAction[] {
  const matches: MarkerMatch[] = []

  let match: RegExpExecArray | null

  while ((match = THREAD_REPLY_REGEX.exec(stdout)) !== null) {
    matches.push({
      index: match.index,
      action: {
        type: 'THREAD_REPLY',
        threadId: match[1],
        message: match[2],
      },
    })
  }

  while ((match = THREAD_RESOLVE_REGEX.exec(stdout)) !== null) {
    matches.push({
      index: match.index,
      action: {
        type: 'THREAD_RESOLVE',
        threadId: match[1],
      },
    })
  }

  while ((match = POST_COMMENT_REGEX.exec(stdout)) !== null) {
    matches.push({
      index: match.index,
      action: {
        type: 'POST_COMMENT',
        message: unescapeNewlines(match[1]),
      },
    })
  }

  while ((match = FETCH_THREADS_REGEX.exec(stdout)) !== null) {
    matches.push({
      index: match.index,
      action: {
        type: 'FETCH_THREADS',
      },
    })
  }

  matches.sort((a, b) => a.index - b.index)

  return matches.map(m => m.action)
}
