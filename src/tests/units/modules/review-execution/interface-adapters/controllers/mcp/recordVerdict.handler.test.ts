import { describe, expect, it } from 'vitest';

import { createRecordVerdictHandler } from '@/modules/review-execution/interface-adapters/controllers/mcp/recordVerdict.handler.js';

describe('recordVerdict handler', () => {
  it('answers the verdict, the levels and the marker to print', () => {
    const handler = createRecordVerdictHandler();

    const result = handler({
      jobId: 'gitlab:project:1',
      findings: [
        {
          dimension: 'conception',
          severity: 'important',
          ruling: 'maintained',
          file: 'a.ts',
          line: 3,
        },
      ],
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.verdict).toBe('changes');
    expect(content.grade).toBe('C');
    expect(content.levels.conception).toBe('C');
    expect(content.marker).toMatch(/^\[REVIEW_STATS:blocking=0:warnings=1:/);
  });

  it('refuses findings it cannot read, naming the problem', () => {
    const handler = createRecordVerdictHandler();

    const result = handler({ findings: [{ dimension: 'style', severity: 'important' }] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^Error: invalid findings/);
    expect(result.content[0].text).toContain('dimension');
  });
});
