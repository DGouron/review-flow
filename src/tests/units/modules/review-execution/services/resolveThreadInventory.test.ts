import type {
  ThreadInventoryGateway,
  ThreadInventoryPage,
} from '@/modules/review-execution/entities/threadInventory/threadInventory.gateway.js';
import { resolveThreadInventory } from '@/modules/review-execution/services/resolveThreadInventory.js';

class RecordingLogger {
  readonly errors: string[] = [];
  info(): void {}
  warn(): void {}
  debug(): void {}
  error(_obj: object, message: string): void {
    this.errors.push(message);
  }
}

class StubThreadInventoryGateway implements ThreadInventoryGateway {
  readonly calls: Array<{ projectPath: string; mrNumber: number; page: number }> = [];
  private pages: ThreadInventoryPage[] = [];
  private failure: Error | null = null;

  setPages(pages: ThreadInventoryPage[]): void {
    this.pages = pages;
  }

  setFailure(error: Error): void {
    this.failure = error;
  }

  fetchPage(projectPath: string, mrNumber: number, page: number): ThreadInventoryPage {
    this.calls.push({ projectPath, mrNumber, page });
    if (this.failure) throw this.failure;
    const found = this.pages.find((p) => p.page === page);
    if (!found) throw new Error(`no page ${page}`);
    return found;
  }
}

const pinned = { projectPath: 'group/project', mrNumber: 42 };

describe('resolveThreadInventory (AC-10 authenticated, complete, fail-closed)', () => {
  it('assembles a complete inventory across all advertised pages', () => {
    const gateway = new StubThreadInventoryGateway();
    gateway.setPages([
      { page: 1, totalPages: 2, threadIds: ['10', '11'] },
      { page: 2, totalPages: 2, threadIds: ['12'] },
    ]);

    const result = resolveThreadInventory(gateway, pinned, new RecordingLogger());

    expect([...result].toSorted()).toEqual(['10', '11', '12']);
    expect(gateway.calls).toEqual([
      { projectPath: 'group/project', mrNumber: 42, page: 1 },
      { projectPath: 'group/project', mrNumber: 42, page: 2 },
    ]);
  });

  it('AC-10.2 fail-closed on fetch failure -> empty set, failure logged, no fallback', () => {
    const gateway = new StubThreadInventoryGateway();
    gateway.setFailure(new Error('auth failure'));
    const logger = new RecordingLogger();

    const result = resolveThreadInventory(gateway, pinned, logger);

    expect(result.size).toBe(0);
    expect(logger.errors.length).toBeGreaterThan(0);
  });

  it('AC-10.3 fail-closed on incomplete pagination -> empty set (not the partial first page)', () => {
    const gateway = new StubThreadInventoryGateway();
    gateway.setPages([{ page: 1, totalPages: 2, threadIds: ['10', '11'] }]);

    const result = resolveThreadInventory(gateway, pinned, new RecordingLogger());

    expect(result.size).toBe(0);
  });

  it('uses the pinned (projectPath, mrNumber) for every page request', () => {
    const gateway = new StubThreadInventoryGateway();
    gateway.setPages([{ page: 1, totalPages: 1, threadIds: ['99'] }]);

    resolveThreadInventory(gateway, pinned, new RecordingLogger());

    expect(gateway.calls[0]).toEqual({ projectPath: 'group/project', mrNumber: 42, page: 1 });
  });
});
