import type { JobStatus, ReviewJob } from '../../frameworks/queue/pQueueAdapter.js'
import type { Presenter } from '../../shared/foundation/presenter.base.js'
import { Duration } from '../../entities/shared/duration.valueObject.js'

export type StatusColor = 'gray' | 'blue' | 'green' | 'red' | 'orange'
export type JobType = 'review' | 'followup'

export interface JobStatusViewModel {
  identifier: string
  displayTitle: string
  projectPath: string
  mrUrl: string
  jobType: JobType
  jobTypeLabel: string
  statusLabel: string
  statusColor: StatusColor
  progressPercent: number
  showProgress: boolean
  errorMessage: string | null
  showRetry: boolean
  elapsedTime: string
  duration: string
}

export class JobStatusPresenter implements Presenter<JobStatus, JobStatusViewModel> {
  present(jobStatus: JobStatus): JobStatusViewModel {
    const { job } = jobStatus
    const { statusLabel, statusColor } = this.getStatusDisplay(jobStatus.status)
    const progressPercent = jobStatus.progress?.overallProgress ?? 0
    const showProgress = jobStatus.status === 'running'

    return {
      identifier: job.id,
      displayTitle: this.formatDisplayTitle(job),
      projectPath: job.projectPath,
      mrUrl: job.mrUrl,
      jobType: job.jobType ?? 'review',
      jobTypeLabel: this.getJobTypeLabel(job.jobType),
      statusLabel,
      statusColor,
      progressPercent,
      showProgress,
      errorMessage: jobStatus.error ?? null,
      showRetry: jobStatus.status === 'failed',
      elapsedTime: this.formatElapsedTime(jobStatus),
      duration: this.formatDuration(jobStatus),
    }
  }

  private formatElapsedTime(jobStatus: JobStatus): string {
    if (!jobStatus.startedAt) return ''
    const elapsedMs = Date.now() - jobStatus.startedAt.getTime()
    return Duration.fromMilliseconds(elapsedMs).formatted
  }

  private formatDuration(jobStatus: JobStatus): string {
    if (!jobStatus.startedAt || !jobStatus.completedAt) return ''
    const durationMs = jobStatus.completedAt.getTime() - jobStatus.startedAt.getTime()
    return Duration.fromMilliseconds(durationMs).formatted
  }

  private formatDisplayTitle(job: ReviewJob): string {
    const title = job.title ?? ''
    return `MR #${job.mrNumber} - ${title}`
  }

  private getJobTypeLabel(jobType: JobType | undefined): string {
    return jobType === 'followup' ? 'Followup' : 'Review'
  }

  private getStatusDisplay(status: JobStatus['status']): { statusLabel: string; statusColor: StatusColor } {
    switch (status) {
      case 'queued':
        return { statusLabel: 'En attente', statusColor: 'gray' }
      case 'running':
        return { statusLabel: 'En cours', statusColor: 'blue' }
      case 'completed':
        return { statusLabel: 'Terminé', statusColor: 'green' }
      case 'failed':
        return { statusLabel: 'Échec', statusColor: 'red' }
    }
  }
}
