import { describe, expect, it } from 'vitest';

import { NudgeAuthorsUseCase } from '@/modules/tracking/usecases/tracking/nudgeAuthors.usecase.js';
import { TrackedMrFactory } from '@/tests/factories/trackedMr.factory.js';
import { StubNoteCommentPostGateway } from '@/tests/stubs/noteCommentPost.stub.js';
import { InMemoryReviewRequestTrackingGateway } from '@/tests/stubs/reviewRequestTracking.stub.js';

const LOCAL_PATH = '/home/user/projects/app';

function setup() {
  const trackingGateway = new InMemoryReviewRequestTrackingGateway();
  const githubPost = new StubNoteCommentPostGateway();
  const gitlabPost = new StubNoteCommentPostGateway();
  const useCase = new NudgeAuthorsUseCase(trackingGateway, (platform) =>
    platform === 'github' ? githubPost : gitlabPost,
  );
  return { trackingGateway, githubPost, gitlabPost, useCase };
}

describe('NudgeAuthorsUseCase', () => {
  it('posts one reminder per tracked merge request, mentioning its author', async () => {
    const { trackingGateway, githubPost, useCase } = setup();
    trackingGateway.create(
      LOCAL_PATH,
      TrackedMrFactory.create({
        id: 'github-org/app-12',
        mrNumber: 12,
        project: 'org/app',
        platform: 'github',
        author: { username: 'carol', displayName: null },
      }),
    );

    const result = await useCase.execute({
      projectPath: LOCAL_PATH,
      mrIds: ['github-org/app-12'],
      language: 'en',
    });

    expect(result).toEqual({ nudged: [12], failed: [] });
    expect(githubPost.calls).toHaveLength(1);
    expect(githubPost.calls[0]?.projectPath).toBe('org/app');
    expect(githubPost.calls[0]?.mrNumber).toBe(12);
    expect(githubPost.calls[0]?.body).toContain('@carol');
    expect(githubPost.calls[0]?.body).toContain('30 days');
  });

  it('writes the reminder in French when the dashboard language is French', async () => {
    const { trackingGateway, gitlabPost, useCase } = setup();
    trackingGateway.create(
      LOCAL_PATH,
      TrackedMrFactory.create({
        id: 'gitlab-org/app-7',
        mrNumber: 7,
        project: 'org/app',
        platform: 'gitlab',
        author: null,
      }),
    );

    await useCase.execute({ projectPath: LOCAL_PATH, mrIds: ['gitlab-org/app-7'], language: 'fr' });

    expect(gitlabPost.calls[0]?.body).toContain('30 jours');
    expect(gitlabPost.calls[0]?.body).not.toContain('@');
  });

  it('skips unknown merge requests and reports those whose comment could not be posted', async () => {
    const { trackingGateway, githubPost, useCase } = setup();
    trackingGateway.create(
      LOCAL_PATH,
      TrackedMrFactory.create({
        id: 'github-org/app-3',
        mrNumber: 3,
        project: 'org/app',
        platform: 'github',
      }),
    );
    githubPost.postComment = async () => {
      throw new Error('gh failed');
    };

    const result = await useCase.execute({
      projectPath: LOCAL_PATH,
      mrIds: ['github-org/app-3', 'github-org/app-404'],
      language: 'en',
    });

    expect(result).toEqual({ nudged: [], failed: [3] });
  });
});
