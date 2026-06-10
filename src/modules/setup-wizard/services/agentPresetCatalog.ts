import type { Preset } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

const PRESET_AGENTS: Record<Preset, string[]> = {
  backend: [
    'architecture',
    'solid',
    'testing',
    'code-quality',
    'security',
    'ddd',
    'clean-architecture',
  ],
  frontend: ['architecture', 'testing', 'code-quality', 'react-best-practices'],
  fullstack: [
    'architecture',
    'solid',
    'testing',
    'code-quality',
    'security',
    'react-best-practices',
  ],
  basic: [],
  custom: [],
};

const FULL_CATALOG = [
  'architecture',
  'solid',
  'testing',
  'code-quality',
  'security',
  'ddd',
  'clean-architecture',
  'react-best-practices',
  'documentation',
  'performance',
];

export function getAgentsForPreset(preset: Preset): string[] {
  return [...PRESET_AGENTS[preset]];
}

export function getFullAgentCatalog(): string[] {
  return [...FULL_CATALOG];
}
