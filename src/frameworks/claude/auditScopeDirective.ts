import type { AgentDefinition } from '@/modules/review-execution/entities/progress/agentDefinition.type.js';

export function buildAuditScopeDirective(scope: AgentDefinition[]): string {
  if (scope.length === 0) {
    return '';
  }

  const principleList = scope
    .map((agent) => `- \`${agent.name}\` (${agent.displayName})`)
    .join('\n');

  return `## REVIEW AUDIT SCOPE — AUTHORITATIVE

CRITICAL: This project has an explicitly resolved review audit scope. It OVERRIDES the default audit list in the review skill markdown.

Run and mention ONLY the following principles, in this order:
${principleList}

Skip every principle that is NOT listed above — do NOT run it, do NOT mention it, do NOT add a report section for it, even if the review skill markdown lists it by default. The meta steps \`threads\` and \`report\` still apply as usual.`;
}
