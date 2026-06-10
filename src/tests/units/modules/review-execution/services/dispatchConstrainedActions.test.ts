import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import type {
  ThreadInventoryGateway,
  ThreadInventoryPage,
} from '@/modules/review-execution/entities/threadInventory/threadInventory.gateway.js';
import { dispatchConstrainedActions } from '@/modules/review-execution/services/dispatchConstrainedActions.js';

class RecordingExecutor {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  run = (command: string, args: string[]): void => {
    this.calls.push({ command, args });
  };
}

class RecordingLogger {
  readonly errors: string[] = [];
  info(): void {}
  warn(): void {}
  debug(): void {}
  error(_obj: object, message: string): void {
    this.errors.push(message);
  }
}

class StubInventoryGateway implements ThreadInventoryGateway {
  private pages: ThreadInventoryPage[] = [];
  private failure: Error | null = null;
  setPages(pages: ThreadInventoryPage[]): void {
    this.pages = pages;
  }
  setFailure(error: Error): void {
    this.failure = error;
  }
  fetchPage(_p: string, _m: number, page: number): ThreadInventoryPage {
    if (this.failure) throw this.failure;
    const found = this.pages.find((x) => x.page === page);
    if (!found) throw new Error(`no page ${page}`);
    return found;
  }
}

const baseContext = {
  platform: 'gitlab' as const,
  projectPath: 'group/project',
  mrNumber: 42,
  localPath: '/tmp/repo',
};

function resolvedDiscussions(executor: RecordingExecutor): string[] {
  return executor.calls
    .filter((c) => c.args.includes('PUT'))
    .map((c) => c.args.find((a) => a.includes('/discussions/')) ?? '');
}

describe('dispatchConstrainedActions (breach closure: forged ids never reach live writes)', () => {
  it('forged out-of-MR resolve id never produces a glab write call', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setPages([{ page: 1, totalPages: 1, threadIds: ['10'] }]);

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: '999' },
      { type: 'THREAD_RESOLVE', threadId: '10' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'trusted',
      inventoryGateway: inventory,
      logger: new RecordingLogger(),
      executor: executor.run,
    });

    const resolves = resolvedDiscussions(executor);
    expect(resolves.some((r) => r.includes('/discussions/999'))).toBe(false);
    expect(resolves.filter((r) => r.includes('/discussions/10')).length).toBe(1);
  });

  it('untrusted job: only postComment reaches the executor', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setPages([{ page: 1, totalPages: 1, threadIds: ['10'] }]);

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: '10' },
      { type: 'THREAD_REPLY', threadId: '10', message: 'x' },
      { type: 'FETCH_THREADS' },
      { type: 'POST_COMMENT', body: 'hi' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'untrusted',
      inventoryGateway: inventory,
      logger: new RecordingLogger(),
      executor: executor.run,
    });

    expect(executor.calls.length).toBe(1);
    expect(executor.calls[0].args).toContain('POST');
    expect(executor.calls[0].args.some((a) => a.endsWith('/notes'))).toBe(true);
  });

  it('AC-10 fail-closed: when the authenticated inventory fetch fails, zero resolve/reply writes occur', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setFailure(new Error('auth failure'));
    const logger = new RecordingLogger();

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: '10' },
      { type: 'THREAD_REPLY', threadId: '10', message: 'x' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'trusted',
      inventoryGateway: inventory,
      logger,
      executor: executor.run,
    });

    expect(executor.calls.length).toBe(0);
    expect(logger.errors.length).toBeGreaterThan(0);
  });

  it('AC-10.1 forged payload inventory is ignored; only authenticated ids are honored', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setPages([{ page: 1, totalPages: 1, threadIds: ['authentic-1'] }]);

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: 'forged-1' },
      { type: 'THREAD_REPLY', threadId: 'forged-2', message: 'x' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'trusted',
      inventoryGateway: inventory,
      logger: new RecordingLogger(),
      executor: executor.run,
    });

    expect(executor.calls.length).toBe(0);
  });
});
