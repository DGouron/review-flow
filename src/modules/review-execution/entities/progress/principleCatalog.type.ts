import type { AgentDefinition } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import type { DeclaredPrincipleSignals } from '@/modules/review-execution/entities/progress/projectPrinciples.gateway.js';

export type PrincipleName =
  | 'clean-architecture'
  | 'ddd'
  | 'solid'
  | 'clean-code'
  | 'react-best-practices'
  | 'testing'
  | 'security'
  | 'performance'
  | 'code-quality';

export const PRINCIPLE_CATALOG: Record<PrincipleName, { displayName: string; keywords: string[] }> =
  {
    'clean-architecture': {
      displayName: 'Clean Archi',
      keywords: ['clean architecture', 'clean-architecture'],
    },
    ddd: { displayName: 'DDD', keywords: ['ddd', 'domain-driven', 'domain driven'] },
    solid: { displayName: 'SOLID', keywords: ['solid'] },
    'clean-code': { displayName: 'Clean Code', keywords: ['clean code', 'clean-code'] },
    'react-best-practices': { displayName: 'React', keywords: ['react'] },
    testing: { displayName: 'Testing', keywords: ['testing', 'tdd'] },
    security: { displayName: 'Security', keywords: ['security'] },
    performance: { displayName: 'Performance', keywords: ['performance'] },
    'code-quality': { displayName: 'Code Quality', keywords: ['code quality', 'code-quality'] },
  };

export const CATALOG_ORDER: PrincipleName[] = [
  'clean-architecture',
  'ddd',
  'react-best-practices',
  'solid',
  'clean-code',
  'testing',
  'security',
  'performance',
  'code-quality',
];

export function isCatalogPrinciple(value: unknown): value is PrincipleName {
  return typeof value === 'string' && value in PRINCIPLE_CATALOG;
}

export function catalogAgentDefinition(name: PrincipleName): AgentDefinition {
  return { name, displayName: PRINCIPLE_CATALOG[name].displayName };
}

function isDeclaredInSkills(name: PrincipleName, skillDirectoryNames: string[]): boolean {
  return skillDirectoryNames.some((directory) => directory.toLowerCase() === name);
}

function isDeclaredInClaudeMd(name: PrincipleName, claudeMd: string | null): boolean {
  if (claudeMd === null) {
    return false;
  }
  const haystack = claudeMd.toLowerCase();
  return PRINCIPLE_CATALOG[name].keywords.some((keyword) => haystack.includes(keyword));
}

export function detectDeclaredPrinciples(signals: DeclaredPrincipleSignals): PrincipleName[] {
  return CATALOG_ORDER.filter(
    (name) =>
      isDeclaredInSkills(name, signals.skillDirectoryNames) ||
      isDeclaredInClaudeMd(name, signals.claudeMd),
  );
}
