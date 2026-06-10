import { GitLabThreadInventoryGateway } from '@/modules/review-execution/interface-adapters/gateways/threadInventory.gitlab.gateway.js';

class RecordingExecutor {
  readonly commands: string[] = [];
  private responses: Array<{ headers: string; body: string }> = [];
  setResponses(responses: Array<{ headers: string; body: string }>): void {
    this.responses = responses;
  }
  run = (command: string): string => {
    this.commands.push(command);
    const index = this.commands.length - 1;
    const response = this.responses[index];
    if (!response) throw new Error('no response configured');
    return `${response.headers}\r\n\r\n${response.body}`;
  };
}

describe('GitLabThreadInventoryGateway', () => {
  it('requests the discussions endpoint with the pinned project and MR, including headers', () => {
    const executor = new RecordingExecutor();
    executor.setResponses([
      {
        headers: 'X-Total-Pages: 1',
        body: JSON.stringify([{ id: 'd1' }, { id: 'd2' }]),
      },
    ]);

    const gateway = new GitLabThreadInventoryGateway(executor.run);
    const page = gateway.fetchPage('group/sub/project', 7, 1);

    expect(executor.commands[0]).toContain('group%2Fsub%2Fproject');
    expect(executor.commands[0]).toContain('/merge_requests/7/discussions');
    expect(executor.commands[0]).toContain('page=1');
    expect(page.totalPages).toBe(1);
    expect(page.threadIds.toSorted()).toEqual(['d1', 'd2']);
  });

  it('reads totalPages from the X-Total-Pages header so completeness can be proven', () => {
    const executor = new RecordingExecutor();
    executor.setResponses([{ headers: 'X-Total-Pages: 3', body: JSON.stringify([{ id: 'a' }]) }]);

    const gateway = new GitLabThreadInventoryGateway(executor.run);
    const page = gateway.fetchPage('g/p', 1, 1);

    expect(page.totalPages).toBe(3);
  });
});
