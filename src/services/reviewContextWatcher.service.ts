import type { ReviewContextGateway } from '../entities/reviewContext/reviewContext.gateway.js'
import type { ReviewContextProgress } from '../entities/reviewContext/reviewContext.js'

export type ProgressCallback = (progress: ReviewContextProgress) => void

const POLLING_INTERVAL_MS = 500

export class ReviewContextWatcherService {
  private watchers = new Map<string, NodeJS.Timeout>()
  private lastProgress = new Map<string, string>()

  constructor(private gateway: ReviewContextGateway) {}

  start(localPath: string, mergeRequestId: string, callback: ProgressCallback): void {
    const interval = setInterval(() => {
      const context = this.gateway.read(localPath, mergeRequestId)
      if (context) {
        const progressKey = JSON.stringify(context.progress)
        if (progressKey !== this.lastProgress.get(mergeRequestId)) {
          this.lastProgress.set(mergeRequestId, progressKey)
          callback(context.progress)

          if (context.progress.phase === 'completed') {
            this.stop(mergeRequestId)
          }
        }
      }
    }, POLLING_INTERVAL_MS)
    this.watchers.set(mergeRequestId, interval)
  }

  isWatching(mergeRequestId: string): boolean {
    return this.watchers.has(mergeRequestId)
  }

  stop(mergeRequestId: string): void {
    const interval = this.watchers.get(mergeRequestId)
    if (interval) {
      clearInterval(interval)
      this.watchers.delete(mergeRequestId)
      this.lastProgress.delete(mergeRequestId)
    }
  }

  stopAll(): void {
    for (const [mergeRequestId] of this.watchers) {
      this.stop(mergeRequestId)
    }
  }
}
