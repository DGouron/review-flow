import { execSync } from 'node:child_process'
import type { ThreadFetchGateway } from '../../entities/threadFetch/threadFetch.gateway.js'
import type { ReviewContextThread } from '../../entities/reviewContext/reviewContext.js'

export type CommandExecutor = (command: string) => string

export const defaultGitHubExecutor: CommandExecutor = (command: string) => {
  return execSync(command, { encoding: 'utf-8', timeout: 30000 })
}

interface GitHubReviewThreadNode {
  id: string
  isResolved: boolean
  path: string | null
  line: number | null
  comments: {
    nodes: Array<{ body: string }>
  }
}

interface GitHubGraphQLResponse {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: GitHubReviewThreadNode[]
        }
      }
    }
  }
}

export class GitHubThreadFetchGateway implements ThreadFetchGateway {
  constructor(private readonly executor: CommandExecutor) {}

  fetchThreads(projectPath: string, mergeRequestNumber: number): ReviewContextThread[] {
    const [owner, name] = projectPath.split('/')
    const query = `query {
      repository(owner: "${owner}", name: "${name}") {
        pullRequest(number: ${mergeRequestNumber}) {
          reviewThreads(first: 100) {
            nodes { id isResolved path line comments(first: 1) { nodes { body } } }
          }
        }
      }
    }`

    const response = this.executor(`gh api graphql -f query='${query}'`)
    const data: GitHubGraphQLResponse = JSON.parse(response)
    const nodes = data.data.repository.pullRequest.reviewThreads.nodes

    return nodes.map((node) => ({
      id: node.id,
      file: node.path,
      line: node.line,
      status: node.isResolved ? 'resolved' as const : 'open' as const,
      body: node.comments.nodes[0]?.body ?? '',
    }))
  }
}
