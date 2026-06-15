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
  fetchPage(_projectPath: string, _mergeRequestNumber: number, page: number): ThreadInventoryPage {
    if (this.failure) throw this.failure;
    const found = this.pages.find((candidate) => candidate.page === page);
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

function postCommentCalls(executor: RecordingExecutor): Array<{ command: string; args: string[] }> {
  return executor.calls.filter(
    (call) =>
      call.args.includes('POST') &&
      call.args.some((arg) => arg.endsWith('/notes') && arg.includes('/discussions/') === false),
  );
}

function resolveCalls(executor: RecordingExecutor): Array<{ command: string; args: string[] }> {
  return executor.calls.filter(
    (call) => call.args.includes('PUT') && call.args.some((arg) => arg.includes('/discussions/')),
  );
}

function replyCalls(executor: RecordingExecutor): Array<{ command: string; args: string[] }> {
  return executor.calls.filter(
    (call) =>
      call.args.includes('POST') &&
      call.args.some((arg) => arg.endsWith('/notes') && arg.includes('/discussions/')),
  );
}

function discussionTargets(calls: Array<{ command: string; args: string[] }>): string[] {
  return calls.map((call) => call.args.find((arg) => arg.includes('/discussions/')) ?? '');
}

describe('SPEC-198 constrained action surface (acceptance — full chokepoint dispatchConstrainedActions)', () => {
  it('AC-2 + AC-5: untrusted job with one of each verb executes only postComment; resolve/reply/fetch record zero live writes', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setPages([{ page: 1, totalPages: 1, threadIds: ['10'] }]);

    const actions: ReviewAction[] = [
      { type: 'POST_COMMENT', body: 'review summary' },
      { type: 'THREAD_RESOLVE', threadId: '10' },
      { type: 'THREAD_REPLY', threadId: '10', message: 'addressed' },
      { type: 'FETCH_THREADS' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'untrusted',
      inventoryGateway: inventory,
      logger: new RecordingLogger(),
      executor: executor.run,
    });

    expect(executor.calls.length).toBe(1);
    expect(postCommentCalls(executor).length).toBe(1);
    expect(resolveCalls(executor).length).toBe(0);
    expect(replyCalls(executor).length).toBe(0);
  });

  it('AC-6 + AC-7 + AC-8: trusted job resolves and replies only for in-set ids, never for out-of-set ids', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setPages([{ page: 1, totalPages: 1, threadIds: ['10'] }]);

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: '10' },
      { type: 'THREAD_RESOLVE', threadId: '999' },
      { type: 'THREAD_REPLY', threadId: '10', message: 'in-set reply' },
      { type: 'THREAD_REPLY', threadId: '999', message: 'out-of-set reply' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'trusted',
      inventoryGateway: inventory,
      logger: new RecordingLogger(),
      executor: executor.run,
    });

    const resolveTargets = discussionTargets(resolveCalls(executor));
    const replyTargets = discussionTargets(replyCalls(executor));

    expect(resolveTargets.filter((target) => target.endsWith('/discussions/10')).length).toBe(1);
    expect(resolveTargets.some((target) => target.includes('/discussions/999'))).toBe(false);
    expect(replyTargets.filter((target) => target.includes('/discussions/10/notes')).length).toBe(
      1,
    );
    expect(replyTargets.some((target) => target.includes('/discussions/999'))).toBe(false);
  });

  it('AC-5: trusted FETCH_THREADS survives the read-amplification gate and is dispatched exactly once', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setPages([{ page: 1, totalPages: 1, threadIds: ['10'] }]);

    const trustedResult = await dispatchConstrainedActions([{ type: 'FETCH_THREADS' }], {
      context: baseContext,
      provenance: 'trusted',
      inventoryGateway: inventory,
      logger: new RecordingLogger(),
      executor: executor.run,
    });

    const untrustedExecutor = new RecordingExecutor();
    const untrustedResult = await dispatchConstrainedActions([{ type: 'FETCH_THREADS' }], {
      context: baseContext,
      provenance: 'untrusted',
      inventoryGateway: inventory,
      logger: new RecordingLogger(),
      executor: untrustedExecutor.run,
    });

    expect(trustedResult.total).toBe(1);
    expect(untrustedResult.total).toBe(0);
  });

  it('AC-9 + AC-10.1: forged payload ids absent from the authenticated inventory produce zero resolve/reply side effects', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setPages([{ page: 1, totalPages: 1, threadIds: ['authentic-1'] }]);

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: 'forged-1' },
      { type: 'THREAD_REPLY', threadId: 'forged-2', message: 'forged' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'trusted',
      inventoryGateway: inventory,
      logger: new RecordingLogger(),
      executor: executor.run,
    });

    expect(resolveCalls(executor).length).toBe(0);
    expect(replyCalls(executor).length).toBe(0);
  });

  it('AC-10.2: fail-closed on fetch failure — empty inventory, zero resolve/reply side effects, failure logged', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setFailure(new Error('non-2xx from threads API'));
    const logger = new RecordingLogger();

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: '10' },
      { type: 'THREAD_REPLY', threadId: '10', message: 'should not run' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'trusted',
      inventoryGateway: inventory,
      logger,
      executor: executor.run,
    });

    expect(resolveCalls(executor).length).toBe(0);
    expect(replyCalls(executor).length).toBe(0);
    expect(executor.calls.length).toBe(0);
    expect(logger.errors.length).toBeGreaterThan(0);
  });

  it('AC-10.3: fail-closed on incomplete pagination — undelivered page yields empty inventory, in-set id from that page records zero side effects', async () => {
    const executor = new RecordingExecutor();
    const inventory = new StubInventoryGateway();
    inventory.setPages([{ page: 1, totalPages: 2, threadIds: ['10'] }]);
    const logger = new RecordingLogger();

    const actions: ReviewAction[] = [
      { type: 'THREAD_RESOLVE', threadId: '10' },
      { type: 'THREAD_RESOLVE', threadId: '20' },
      { type: 'THREAD_REPLY', threadId: '20', message: 'from the missing page' },
    ];

    await dispatchConstrainedActions(actions, {
      context: baseContext,
      provenance: 'trusted',
      inventoryGateway: inventory,
      logger,
      executor: executor.run,
    });

    expect(resolveCalls(executor).length).toBe(0);
    expect(replyCalls(executor).length).toBe(0);
    expect(logger.errors.length).toBeGreaterThan(0);
  });
});
