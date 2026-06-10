import { describe, it, expect } from 'vitest';

import {
  DEFAULT_AGENTS,
  DEFAULT_FRONT_AGENTS,
  DEFAULT_BACK_AGENTS,
  DEFAULT_FULLSTACK_AGENTS,
  DEFAULT_DOC_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import { dedupAgents } from '@/modules/review-execution/entities/progress/reviewFocus.type.js';

describe('DEFAULT_AGENTS (backward compatibility)', () => {
  it('keeps the legacy React-centric default list with the Clean Code audit', () => {
    expect(DEFAULT_AGENTS.map((agent) => agent.name)).toEqual([
      'clean-architecture',
      'ddd',
      'react-best-practices',
      'solid',
      'clean-code',
      'testing',
      'code-quality',
      'threads',
      'report',
    ]);
  });
});

describe('DEFAULT_FRONT_AGENTS', () => {
  it('exposes the front-end audit pipeline', () => {
    expect(DEFAULT_FRONT_AGENTS.map((agent) => agent.name)).toEqual([
      'clean-architecture',
      'ddd',
      'react-best-practices',
      'solid',
      'testing',
      'code-quality',
      'threads',
      'report',
    ]);
  });
});

describe('DEFAULT_BACK_AGENTS', () => {
  it('replaces react-best-practices with security and performance', () => {
    const names = DEFAULT_BACK_AGENTS.map((agent) => agent.name);
    expect(names).toContain('security');
    expect(names).toContain('performance');
    expect(names).not.toContain('react-best-practices');
  });

  it('keeps clean-architecture, ddd, solid, testing, code-quality, threads, report', () => {
    const names = DEFAULT_BACK_AGENTS.map((agent) => agent.name);
    expect(names).toEqual([
      'clean-architecture',
      'ddd',
      'solid',
      'testing',
      'code-quality',
      'security',
      'performance',
      'threads',
      'report',
    ]);
  });
});

describe('DEFAULT_FULLSTACK_AGENTS', () => {
  it('lists audit agents from FRONT followed by BACK extras, then terminal agents', () => {
    expect(DEFAULT_FULLSTACK_AGENTS.map((agent) => agent.name)).toEqual([
      'clean-architecture',
      'ddd',
      'react-best-practices',
      'solid',
      'testing',
      'code-quality',
      'security',
      'performance',
      'threads',
      'report',
    ]);
  });

  it('has no duplicate agent names (dedup property)', () => {
    const names = DEFAULT_FULLSTACK_AGENTS.map((agent) => agent.name);
    expect(names).toEqual(Array.from(new Set(names)));
  });

  it('contains every agent name from FRONT and BACK', () => {
    const names = DEFAULT_FULLSTACK_AGENTS.map((agent) => agent.name);
    for (const front of DEFAULT_FRONT_AGENTS) {
      expect(names).toContain(front.name);
    }
    for (const back of DEFAULT_BACK_AGENTS) {
      expect(names).toContain(back.name);
    }
  });

  it('uses dedupAgents from the value object to enforce uniqueness on doubled inputs', () => {
    const result = dedupAgents([...DEFAULT_FULLSTACK_AGENTS, ...DEFAULT_FULLSTACK_AGENTS]);
    expect(result).toEqual(DEFAULT_FULLSTACK_AGENTS);
  });
});

describe('DEFAULT_DOC_AGENTS', () => {
  it('exposes the five documentation audits and the terminal threads/report agents', () => {
    expect(DEFAULT_DOC_AGENTS.map((agent) => agent.name)).toEqual([
      'markdown-quality',
      'link-validity',
      'terminology',
      'freshness',
      'examples-validity',
      'threads',
      'report',
    ]);
  });

  it('does not contain any code-architecture audit', () => {
    const names = DEFAULT_DOC_AGENTS.map((agent) => agent.name);
    expect(names).not.toContain('clean-architecture');
    expect(names).not.toContain('ddd');
    expect(names).not.toContain('solid');
    expect(names).not.toContain('react-best-practices');
  });
});
