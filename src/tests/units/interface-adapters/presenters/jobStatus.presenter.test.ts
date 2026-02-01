import { describe, it, expect } from 'vitest'
import { JobStatusPresenter } from '../../../../interface-adapters/presenters/jobStatus.presenter.js'
import { ReviewJobFactory } from '../../../factories/reviewJob.factory.js'

describe('JobStatusPresenter', () => {
  describe('present', () => {
    it('should present queued job with gray status', () => {
      const presenter = new JobStatusPresenter()
      const jobStatus = {
        job: ReviewJobFactory.create(),
        status: 'queued' as const,
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.statusLabel).toBe('En attente')
      expect(viewModel.statusColor).toBe('gray')
      expect(viewModel.progressPercent).toBe(0)
      expect(viewModel.showProgress).toBe(false)
    })

    it('should present running job with blue status and progress', () => {
      const presenter = new JobStatusPresenter()
      const jobStatus = {
        job: ReviewJobFactory.create(),
        status: 'running' as const,
        startedAt: new Date(),
        progress: {
          agents: [],
          currentPhase: 'agents-running' as const,
          overallProgress: 45,
          lastUpdate: new Date(),
        },
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.statusLabel).toBe('En cours')
      expect(viewModel.statusColor).toBe('blue')
      expect(viewModel.progressPercent).toBe(45)
      expect(viewModel.showProgress).toBe(true)
    })

    it('should present completed job with green status', () => {
      const presenter = new JobStatusPresenter()
      const jobStatus = {
        job: ReviewJobFactory.create(),
        status: 'completed' as const,
        startedAt: new Date(Date.now() - 180000),
        completedAt: new Date(),
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.statusLabel).toBe('Terminé')
      expect(viewModel.statusColor).toBe('green')
      expect(viewModel.showProgress).toBe(false)
    })

    it('should present failed job with red status', () => {
      const presenter = new JobStatusPresenter()
      const jobStatus = {
        job: ReviewJobFactory.create(),
        status: 'failed' as const,
        error: 'Process killed: memory limit',
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.statusLabel).toBe('Échec')
      expect(viewModel.statusColor).toBe('red')
      expect(viewModel.showProgress).toBe(false)
    })

    it('should include job metadata in view model', () => {
      const presenter = new JobStatusPresenter()
      const jobStatus = {
        job: ReviewJobFactory.create({
          id: 'gitlab:my-org/my-repo:42',
          projectPath: 'my-org/my-repo',
          mrNumber: 42,
          mrUrl: 'https://gitlab.com/my-org/my-repo/-/merge_requests/42',
          title: 'feat: add new feature',
          jobType: 'review' as const,
        }),
        status: 'queued' as const,
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.identifier).toBe('gitlab:my-org/my-repo:42')
      expect(viewModel.displayTitle).toBe('MR #42 - feat: add new feature')
      expect(viewModel.projectPath).toBe('my-org/my-repo')
      expect(viewModel.mrUrl).toBe('https://gitlab.com/my-org/my-repo/-/merge_requests/42')
      expect(viewModel.jobType).toBe('review')
      expect(viewModel.jobTypeLabel).toBe('Review')
    })

    it('should include error message for failed job', () => {
      const presenter = new JobStatusPresenter()
      const jobStatus = {
        job: ReviewJobFactory.create(),
        status: 'failed' as const,
        error: 'Process killed: memory limit',
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.errorMessage).toBe('Process killed: memory limit')
      expect(viewModel.showRetry).toBe(true)
    })

    it('should have null error message for successful job', () => {
      const presenter = new JobStatusPresenter()
      const jobStatus = {
        job: ReviewJobFactory.create(),
        status: 'completed' as const,
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.errorMessage).toBeNull()
      expect(viewModel.showRetry).toBe(false)
    })

    it('should format elapsed time for running job', () => {
      const presenter = new JobStatusPresenter()
      const twoMinutesAgo = new Date(Date.now() - 120000)
      const jobStatus = {
        job: ReviewJobFactory.create(),
        status: 'running' as const,
        startedAt: twoMinutesAgo,
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.elapsedTime).toBe('2m')
    })

    it('should format duration for completed job', () => {
      const presenter = new JobStatusPresenter()
      const jobStatus = {
        job: ReviewJobFactory.create(),
        status: 'completed' as const,
        startedAt: new Date(Date.now() - 180000),
        completedAt: new Date(),
      }

      const viewModel = presenter.present(jobStatus)

      expect(viewModel.duration).toBe('3m')
    })
  })
})
