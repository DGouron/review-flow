import type { JobStatus } from '../../queue/reviewQueue.js'
import type { JobStatusPresenter, JobStatusViewModel } from './jobStatus.presenter.js'

export interface ReviewListViewModel {
  activeJobs: JobStatusViewModel[]
  recentJobs: JobStatusViewModel[]
  activeCount: number
  recentCount: number
  totalCount: number
  isEmpty: boolean
  emptyMessage: string
  showActive: boolean
  showRecent: boolean
  queuedCount: number
  runningCount: number
  failedCount: number
}

export class ReviewListPresenter {
  constructor(private jobPresenter: JobStatusPresenter) {}

  present(active: JobStatus[], recent: JobStatus[]): ReviewListViewModel {
    const activeJobs = active.map(job => this.jobPresenter.present(job))
    const recentJobs = recent.map(job => this.jobPresenter.present(job))
    const activeCount = activeJobs.length
    const recentCount = recentJobs.length
    const totalCount = activeCount + recentCount

    const allJobs = [...active, ...recent]
    const queuedCount = allJobs.filter(j => j.status === 'queued').length
    const runningCount = allJobs.filter(j => j.status === 'running').length
    const failedCount = allJobs.filter(j => j.status === 'failed').length

    return {
      activeJobs,
      recentJobs,
      activeCount,
      recentCount,
      totalCount,
      isEmpty: totalCount === 0,
      emptyMessage: 'Aucune review en cours',
      showActive: activeCount > 0,
      showRecent: recentCount > 0,
      queuedCount,
      runningCount,
      failedCount,
    }
  }
}
