import { ReviewJobFactory } from '../../factories/reviewJob.factory.js'
import { GitLabEventFactory } from '../../factories/gitLabEvent.factory.js'
import { GitHubEventFactory } from '../../factories/gitHubEvent.factory.js'

describe('ReviewJobFactory', () => {
  it('should create a valid ReviewJob with defaults', () => {
    const job = ReviewJobFactory.create()

    expect(job.id).toBe('gitlab:test-org/test-project:42')
    expect(job.platform).toBe('gitlab')
    expect(job.mrNumber).toBe(42)
    expect(job.jobType).toBe('review')
  })

  it('should allow overriding specific fields', () => {
    const job = ReviewJobFactory.create({ mrNumber: 99, sourceBranch: 'hotfix/urgent' })

    expect(job.mrNumber).toBe(99)
    expect(job.sourceBranch).toBe('hotfix/urgent')
    expect(job.platform).toBe('gitlab')
  })

  it('should create a GitHub job', () => {
    const job = ReviewJobFactory.createGitHub()

    expect(job.platform).toBe('github')
    expect(job.mrUrl).toContain('github.com')
  })

  it('should create a followup job', () => {
    const job = ReviewJobFactory.createFollowup()

    expect(job.jobType).toBe('followup')
  })
})

describe('GitLabEventFactory', () => {
  it('should create a valid MR event with defaults', () => {
    const event = GitLabEventFactory.createMergeRequestEvent()

    expect(event.object_kind).toBe('merge_request')
    expect(event.object_attributes.state).toBe('opened')
    expect(event.object_attributes.draft).toBe(false)
  })

  it('should allow deep overrides', () => {
    const event = GitLabEventFactory.createMergeRequestEvent({
      object_attributes: {
        iid: 99,
        title: 'Custom MR',
      },
    })

    expect(event.object_attributes.iid).toBe(99)
    expect(event.object_attributes.title).toBe('Custom MR')
    expect(event.object_attributes.state).toBe('opened')
  })

  it('should create a draft MR', () => {
    const event = GitLabEventFactory.createDraftMr()

    expect(event.object_attributes.draft).toBe(true)
  })

  it('should create an MR with reviewer added', () => {
    const event = GitLabEventFactory.createWithReviewerAdded('claude-reviewer')

    expect(event.reviewers).toContainEqual(
      expect.objectContaining({ username: 'claude-reviewer' })
    )
    expect(event.changes?.reviewers?.current).toContainEqual({ username: 'claude-reviewer' })
    expect(event.changes?.reviewers?.previous).toEqual([])
  })

  it('should create a closed MR', () => {
    const event = GitLabEventFactory.createClosedMr()

    expect(event.object_attributes.state).toBe('closed')
    expect(event.object_attributes.action).toBe('close')
  })

  it('should create a push event', () => {
    const event = GitLabEventFactory.createPushEvent()

    expect(event.object_kind).toBe('push')
    expect(event.commits.length).toBeGreaterThan(0)
  })
})

describe('GitHubEventFactory', () => {
  it('should create a valid PR event with defaults', () => {
    const event = GitHubEventFactory.createPullRequestEvent()

    expect(event.action).toBe('opened')
    expect(event.pull_request.state).toBe('open')
    expect(event.pull_request.draft).toBe(false)
  })

  it('should allow deep overrides', () => {
    const event = GitHubEventFactory.createPullRequestEvent({
      number: 456,
      pull_request: {
        title: 'Custom PR',
      },
    })

    expect(event.number).toBe(456)
    expect(event.pull_request.title).toBe('Custom PR')
    expect(event.pull_request.state).toBe('open')
  })

  it('should create a draft PR', () => {
    const event = GitHubEventFactory.createDraftPr()

    expect(event.pull_request.draft).toBe(true)
  })

  it('should create a PR with review requested', () => {
    const event = GitHubEventFactory.createReviewRequestedPr('claude-reviewer')

    expect(event.action).toBe('review_requested')
    expect(event.requested_reviewer?.login).toBe('claude-reviewer')
  })

  it('should create a closed PR', () => {
    const event = GitHubEventFactory.createClosedPr()

    expect(event.action).toBe('closed')
    expect(event.pull_request.state).toBe('closed')
  })
})
