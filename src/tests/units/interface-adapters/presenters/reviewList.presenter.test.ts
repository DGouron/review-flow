import { describe, it, expect } from 'vitest'
import { ReviewListPresenter } from '../../../../interface-adapters/presenters/reviewList.presenter.js'
import { JobStatusPresenter } from '../../../../interface-adapters/presenters/jobStatus.presenter.js'
import { ReviewJobFactory } from '../../../factories/reviewJob.factory.js'

describe('ReviewListPresenter', () => {
  const jobPresenter = new JobStatusPresenter()

  describe('present', () => {
    it('should present empty list with appropriate message', () => {
      const presenter = new ReviewListPresenter(jobPresenter)

      const viewModel = presenter.present([], [])

      expect(viewModel.isEmpty).toBe(true)
      expect(viewModel.emptyMessage).toBe('Aucune review en cours')
      expect(viewModel.activeCount).toBe(0)
      expect(viewModel.recentCount).toBe(0)
    })

    it('should present active jobs only', () => {
      const presenter = new ReviewListPresenter(jobPresenter)
      const activeJobs = [
        { job: ReviewJobFactory.create(), status: 'queued' as const },
        { job: ReviewJobFactory.create(), status: 'running' as const },
      ]

      const viewModel = presenter.present(activeJobs, [])

      expect(viewModel.activeCount).toBe(2)
      expect(viewModel.recentCount).toBe(0)
      expect(viewModel.activeJobs).toHaveLength(2)
      expect(viewModel.showActive).toBe(true)
      expect(viewModel.showRecent).toBe(false)
      expect(viewModel.isEmpty).toBe(false)
    })

    it('should present mix of active and recent jobs', () => {
      const presenter = new ReviewListPresenter(jobPresenter)
      const activeJobs = [
        { job: ReviewJobFactory.create(), status: 'running' as const },
      ]
      const recentJobs = [
        { job: ReviewJobFactory.create(), status: 'completed' as const },
        { job: ReviewJobFactory.create(), status: 'failed' as const },
        { job: ReviewJobFactory.create(), status: 'completed' as const },
      ]

      const viewModel = presenter.present(activeJobs, recentJobs)

      expect(viewModel.activeCount).toBe(1)
      expect(viewModel.recentCount).toBe(3)
      expect(viewModel.totalCount).toBe(4)
      expect(viewModel.showActive).toBe(true)
      expect(viewModel.showRecent).toBe(true)
    })

    it('should include quick stats', () => {
      const presenter = new ReviewListPresenter(jobPresenter)
      const activeJobs = [
        { job: ReviewJobFactory.create(), status: 'queued' as const },
        { job: ReviewJobFactory.create(), status: 'queued' as const },
        { job: ReviewJobFactory.create(), status: 'running' as const },
      ]
      const recentJobs = [
        { job: ReviewJobFactory.create(), status: 'failed' as const },
      ]

      const viewModel = presenter.present(activeJobs, recentJobs)

      expect(viewModel.queuedCount).toBe(2)
      expect(viewModel.runningCount).toBe(1)
      expect(viewModel.failedCount).toBe(1)
    })
  })
})
