export interface AgentDefinition {
  name: string;
  displayName: string;
}

export const THREADS_AGENT: AgentDefinition = { name: 'threads', displayName: 'Threads' };
export const REPORT_AGENT: AgentDefinition = { name: 'report', displayName: 'Rapport' };

export function withMetaSteps(scope: AgentDefinition[]): AgentDefinition[] {
  const seen = new Set<string>();
  const result: AgentDefinition[] = [];
  for (const agent of [...scope, THREADS_AGENT, REPORT_AGENT]) {
    if (!seen.has(agent.name)) {
      seen.add(agent.name);
      result.push(agent);
    }
  }
  return result;
}

export const DEFAULT_AGENTS: AgentDefinition[] = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'react-best-practices', displayName: 'React' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'clean-code', displayName: 'Clean Code' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_FOLLOWUP_AGENTS: AgentDefinition[] = [
  { name: 'context', displayName: 'Contexte' },
  { name: 'verify', displayName: 'Vérification' },
  { name: 'scan', displayName: 'Scan' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_FRONT_AGENTS: AgentDefinition[] = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'react-best-practices', displayName: 'React' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_BACK_AGENTS: AgentDefinition[] = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
  { name: 'security', displayName: 'Security' },
  { name: 'performance', displayName: 'Performance' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_FULLSTACK_AGENTS: AgentDefinition[] = [
  { name: 'clean-architecture', displayName: 'Clean Archi' },
  { name: 'ddd', displayName: 'DDD' },
  { name: 'react-best-practices', displayName: 'React' },
  { name: 'solid', displayName: 'SOLID' },
  { name: 'testing', displayName: 'Testing' },
  { name: 'code-quality', displayName: 'Code Quality' },
  { name: 'security', displayName: 'Security' },
  { name: 'performance', displayName: 'Performance' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];

export const DEFAULT_DOC_AGENTS: AgentDefinition[] = [
  { name: 'markdown-quality', displayName: 'Markdown Quality' },
  { name: 'link-validity', displayName: 'Link Validity' },
  { name: 'terminology', displayName: 'Terminology' },
  { name: 'freshness', displayName: 'Freshness' },
  { name: 'examples-validity', displayName: 'Examples Validity' },
  { name: 'threads', displayName: 'Threads' },
  { name: 'report', displayName: 'Rapport' },
];
