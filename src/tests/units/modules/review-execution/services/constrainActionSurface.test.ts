import type { ReviewAction } from '@/modules/review-execution/entities/reviewAction/reviewAction.js';
import { constrainActionSurface } from '@/modules/review-execution/services/constrainActionSurface.js';

const inventory = (...ids: string[]): ReadonlySet<string> => new Set(ids);

describe('constrainActionSurface', () => {
  describe('AC-2 untrusted write surface = postComment only', () => {
    it('keeps only postComment for an untrusted job, dropping resolve/reply/fetch', () => {
      const actions: ReviewAction[] = [
        { type: 'THREAD_RESOLVE', threadId: '10' },
        { type: 'THREAD_REPLY', threadId: '10', message: 'hi' },
        { type: 'POST_COMMENT', body: 'ok' },
        { type: 'FETCH_THREADS' },
      ];

      const result = constrainActionSurface(actions, {
        provenance: 'untrusted',
        threadInventory: inventory('10'),
      });

      expect(result).toEqual([{ type: 'POST_COMMENT', body: 'ok' }]);
    });
  });

  describe('AC-5 FETCH_THREADS restricted to trusted (read-amplification gate)', () => {
    it('drops FETCH_THREADS for untrusted', () => {
      const result = constrainActionSurface([{ type: 'FETCH_THREADS' }], {
        provenance: 'untrusted',
        threadInventory: inventory('10'),
      });
      expect(result).toEqual([]);
    });

    it('keeps FETCH_THREADS for trusted', () => {
      const result = constrainActionSurface([{ type: 'FETCH_THREADS' }], {
        provenance: 'trusted',
        threadInventory: inventory('10'),
      });
      expect(result).toEqual([{ type: 'FETCH_THREADS' }]);
    });
  });

  describe('AC-6 THREAD_RESOLVE target validation', () => {
    it('keeps in-set ids (with trim) and drops out-of-set on a trusted job', () => {
      const actions: ReviewAction[] = [
        { type: 'THREAD_RESOLVE', threadId: '10' },
        { type: 'THREAD_RESOLVE', threadId: '999' },
        { type: 'THREAD_RESOLVE', threadId: '11 ' },
      ];
      const result = constrainActionSurface(actions, {
        provenance: 'trusted',
        threadInventory: inventory('10', '11'),
      });
      expect(result).toEqual([
        { type: 'THREAD_RESOLVE', threadId: '10' },
        { type: 'THREAD_RESOLVE', threadId: '11' },
      ]);
    });
  });

  describe('AC-7 THREAD_REPLY target validation', () => {
    it('keeps in-set id and drops out-of-set on a trusted job', () => {
      const actions: ReviewAction[] = [
        { type: 'THREAD_REPLY', threadId: '10', message: 'a' },
        { type: 'THREAD_REPLY', threadId: '999', message: 'b' },
      ];
      const result = constrainActionSurface(actions, {
        provenance: 'trusted',
        threadInventory: inventory('10', '11'),
      });
      expect(result).toEqual([{ type: 'THREAD_REPLY', threadId: '10', message: 'a' }]);
    });
  });

  describe('AC-8 target validation precedes provenance, both required for resolve/reply', () => {
    const matrix = [
      { provenance: 'trusted' as const, threadId: '10', kept: true },
      { provenance: 'trusted' as const, threadId: '999', kept: false },
      { provenance: 'untrusted' as const, threadId: '10', kept: false },
      { provenance: 'untrusted' as const, threadId: '999', kept: false },
    ];

    for (const verb of ['THREAD_RESOLVE', 'THREAD_REPLY'] as const) {
      for (const cell of matrix) {
        it(`${verb} ${cell.provenance} ${cell.threadId} -> ${cell.kept ? 'kept' : 'dropped'}`, () => {
          const action: ReviewAction =
            verb === 'THREAD_RESOLVE'
              ? { type: 'THREAD_RESOLVE', threadId: cell.threadId }
              : { type: 'THREAD_REPLY', threadId: cell.threadId, message: 'x' };
          const result = constrainActionSurface([action], {
            provenance: cell.provenance,
            threadInventory: inventory('10', '11'),
          });
          expect(result.length).toBe(cell.kept ? 1 : 0);
        });
      }
    }
  });

  describe('AC-9 inventory is authoritative single source', () => {
    it('acts only on ids present in the passed inventory, ignoring spoofed look-alike ids', () => {
      const actions: ReviewAction[] = [
        { type: 'THREAD_RESOLVE', threadId: '42' },
        { type: 'THREAD_RESOLVE', threadId: '7' },
      ];
      const result = constrainActionSurface(actions, {
        provenance: 'trusted',
        threadInventory: inventory('42'),
      });
      expect(result).toEqual([{ type: 'THREAD_RESOLVE', threadId: '42' }]);
    });
  });

  describe('AC-10 empty inventory drops all resolve/reply', () => {
    it('drops every resolve/reply when the authenticated inventory is empty (fail-closed)', () => {
      const actions: ReviewAction[] = [
        { type: 'THREAD_RESOLVE', threadId: '10' },
        { type: 'THREAD_REPLY', threadId: '10', message: 'a' },
        { type: 'POST_COMMENT', body: 'still ok' },
      ];
      const result = constrainActionSurface(actions, {
        provenance: 'trusted',
        threadInventory: inventory(),
      });
      expect(result).toEqual([{ type: 'POST_COMMENT', body: 'still ok' }]);
    });
  });
});
