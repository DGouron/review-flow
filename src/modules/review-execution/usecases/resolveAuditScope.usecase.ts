import {
  type AgentDefinition,
  DEFAULT_AGENTS,
} from '@/modules/review-execution/entities/progress/agentDefinition.type.js';
import {
  catalogAgentDefinition,
  detectDeclaredPrinciples,
  isCatalogPrinciple,
} from '@/modules/review-execution/entities/progress/principleCatalog.type.js';
import type { DeclaredPrincipleSignals } from '@/modules/review-execution/entities/progress/projectPrinciples.gateway.js';
import {
  type ReviewFocus,
  defaultAgentsForFocus,
} from '@/modules/review-execution/entities/progress/reviewFocus.type.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface ResolveAuditScopeInput {
  audits: string[] | null;
  agents: AgentDefinition[] | null;
  focus: ReviewFocus | null;
  signals: DeclaredPrincipleSignals;
}

const META_STEP_NAMES = new Set(['threads', 'report']);

function stripMetaSteps(agents: AgentDefinition[]): AgentDefinition[] {
  return agents.filter((agent) => !META_STEP_NAMES.has(agent.name));
}

export class ResolveAuditScopeUseCase implements UseCase<
  ResolveAuditScopeInput,
  AgentDefinition[]
> {
  execute(input: ResolveAuditScopeInput): AgentDefinition[] {
    const fromAudits = this.fromAudits(input.audits);
    if (fromAudits.length > 0) {
      return fromAudits;
    }

    const fromAgents = this.fromAgents(input.agents);
    if (fromAgents.length > 0) {
      return fromAgents;
    }

    const detected = detectDeclaredPrinciples(input.signals).map(catalogAgentDefinition);
    if (detected.length > 0) {
      return detected;
    }

    return this.focusDefaults(input.focus);
  }

  private fromAudits(audits: string[] | null): AgentDefinition[] {
    if (audits === null) {
      return [];
    }
    return audits.filter(isCatalogPrinciple).map(catalogAgentDefinition);
  }

  private fromAgents(agents: AgentDefinition[] | null): AgentDefinition[] {
    if (agents === null) {
      return [];
    }
    return stripMetaSteps(agents);
  }

  private focusDefaults(focus: ReviewFocus | null): AgentDefinition[] {
    const defaults = focus === null ? DEFAULT_AGENTS : defaultAgentsForFocus(focus);
    return stripMetaSteps(defaults);
  }
}
